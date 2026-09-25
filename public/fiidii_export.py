"""
fiidii_export.py

=================

Exports FII/DII data to:

    C:\\Users\\TDutta\\derivasense\\public\\fiidii_data.json

Preserves the existing dashboard export:

    - asOf
    - fiidii
    - fiiPctTrend
    - flowTrend

Adds:

    - participantActivityDate
    - participantActivity

Also uploads the SAME FII/DII snapshot to Neon:

    public.fiidii_data

using:

    backend\\.env
    DATABASE_URL

The Neon upload is performed only AFTER the local JSON file
has been successfully written.

If Neon is unavailable, the local JSON export remains valid
and the FII/DII script continues normally.

The participant calculation follows the logic used by:

    master_fiidii_website_mod1.py

Participant activity:

    FII
        Cash
        Future
        CE
        PE

    PRO
        Future
        CE
        PE

    DII
        Cash
        Future
        CE
        PE

    RETAIL
        Future
        CE
        PE

The participant table date is taken from the latest
usable NSE/FIIOIDATA trading date.

It is NOT taken from datetime.now().
"""


import json
import os
import psycopg2

from datetime import datetime


# ============================================================
# GOOGLE SHEETS
# ============================================================

import gspread

from oauth2client.service_account import (
    ServiceAccountCredentials
)


# ============================================================
# JSON OUTPUT PATH
# ============================================================

FIIDII_JSON_PATH = (
    r"C:\Users\TDutta\derivasense\public\fiidii_data.json"
)


# ============================================================
# NEON DATABASE
# ============================================================

ENV_PATH = (
    r"C:\Users\TDutta\derivasense\backend\.env"
)


# ============================================================
# GOOGLE SHEET SETTINGS
# ============================================================

CREDS_PATH = (
    r"C:\Users\TDutta\optionchain_python"
    r"\FIIDATA\fifth-boulder-433716-a3-b5d17b4bcefd.json"
)

GSHEET_NAME = "FII DATA"

SCOPE = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive",
]


# ============================================================
# PARTICIPANT TABLE SETTINGS
# ============================================================

TABLE_SOURCE_TAB = "FIIOIDATA"

INCLUDE_STOCK_FUTURES = False

ROW_ORDER = [
    "FII",
    "PRO",
    "DII",
    "RETAIL",
]


PARTICIPANT_ALIASES = {
    "FII": "FII",
    "FII/FPI": "FII",
    "FPI": "FII",

    "PRO": "PRO",
    "PROP": "PRO",

    "DII": "DII",

    "CLIENT": "RETAIL",
    "RETAIL": "RETAIL",
}


CASH_PARTICIPANTS = (
    "FII",
    "DII",
)


# ============================================================
# GOOGLE SHEETS CLIENT
# ============================================================

_gclient = None


def _get_gclient():

    global _gclient

    if _gclient is not None:
        return _gclient

    try:

        credentials = (
            ServiceAccountCredentials
            .from_json_keyfile_name(
                CREDS_PATH,
                SCOPE,
            )
        )

        _gclient = gspread.authorize(
            credentials
        )

        return _gclient

    except Exception as e:

        print(
            "[FII/DII DASHBOARD] "
            f"Google Sheets authentication failed: {e}"
        )

        return None


# ============================================================
# GOOGLE SHEET WORKSHEET
# ============================================================

def _get_worksheet(tab_name):

    client = _get_gclient()

    if client is None:
        return None

    try:

        spreadsheet = client.open(
            GSHEET_NAME
        )

        return spreadsheet.worksheet(
            tab_name
        )

    except Exception as e:

        print(
            "[FII/DII DASHBOARD] "
            f"Could not open worksheet "
            f"'{tab_name}': {e}"
        )

        return None


# ============================================================
# EXISTING NUMERIC HELPER
# ============================================================

def _f(v, default=0.0):

    try:

        f = float(v)

        return default if f != f else f

    except (
        TypeError,
        ValueError,
    ):

        return default


# ============================================================
# EXISTING DATE DISPLAY HELPER
# ============================================================

def _date_str(v):

    if hasattr(
        v,
        "strftime"
    ):

        return v.strftime(
            "%d %b"
        )

    return str(v)


# ============================================================
# PARTICIPANT NORMALIZATION
# ============================================================

def _norm_participant(label):

    return PARTICIPANT_ALIASES.get(
        str(label)
        .strip()
        .upper()
    )


# ============================================================
# DATE PARSER
# ============================================================

def _parse_any_date(value):

    value = str(
        value
    ).strip()

    for fmt in (
        "%d%m%Y",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
    ):

        try:

            return datetime.strptime(
                value,
                fmt
            )

        except ValueError:

            continue

    return None


# ============================================================
# TABLE NUMERIC HELPER
# ============================================================

def _tbl_float(value):

    try:

        return float(
            str(value)
            .replace(",", "")
            .replace("%", "")
            .strip()
        )

    except (
        ValueError,
        AttributeError,
    ):

        return 0.0


# ============================================================
# PARTICIPANT CHANGE CALCULATION
#
# Matches master_fiidii_website_mod1.py
# ============================================================

def _compute_participant_changes():

    ws = _get_worksheet(
        TABLE_SOURCE_TAB
    )

    if ws is None:

        return None, {}

    try:

        rows = ws.get_all_values()

    except Exception as e:

        print(
            "[FII/DII DASHBOARD] "
            f"Could not read "
            f"{TABLE_SOURCE_TAB}: {e}"
        )

        return None, {}

    if len(rows) < 3:

        print(
            "[FII/DII DASHBOARD] "
            f"'{TABLE_SOURCE_TAB}' "
            "has no usable data."
        )

        return None, {}

    # --------------------------------------------------------
    # Detect whether first row is header
    # --------------------------------------------------------

    start = (
        0
        if _parse_any_date(
            rows[0][0]
        )
        else 1
    )

    # --------------------------------------------------------
    # nets[date][participant]
    #
    # Future / CE / PE
    # --------------------------------------------------------

    nets = {}

    for row in rows[start:]:

        if len(row) < 10:
            continue

        dt = _parse_any_date(
            row[0]
        )

        who = _norm_participant(
            row[1]
        )

        if (
            dt is None
            or who is None
        ):
            continue

        # ----------------------------------------------------
        # Future net
        #
        # Future Index Long
        # -
        # Future Index Short
        # ----------------------------------------------------

        future = (
            _tbl_float(row[2])
            -
            _tbl_float(row[3])
        )

        # ----------------------------------------------------
        # Optional Stock Futures
        # ----------------------------------------------------

        if INCLUDE_STOCK_FUTURES:

            future += (
                _tbl_float(row[4])
                -
                _tbl_float(row[5])
            )

        # ----------------------------------------------------
        # CE net
        #
        # Option Index Call Long
        # -
        # Option Index Call Short
        # ----------------------------------------------------

        ce = (
            _tbl_float(row[6])
            -
            _tbl_float(row[8])
        )

        # ----------------------------------------------------
        # PE net
        #
        # Option Index Put Long
        # -
        # Option Index Put Short
        # ----------------------------------------------------

        pe = (
            _tbl_float(row[7])
            -
            _tbl_float(row[9])
        )

        nets.setdefault(
            dt,
            {}
        )[who] = (
            future,
            ce,
            pe,
        )

    # --------------------------------------------------------
    # Require at least four participants
    #
    # This matches the master logic.
    # --------------------------------------------------------

    usable_dates = sorted(
        dt
        for dt, participants
        in nets.items()
        if len(participants) >= 4
    )

    if len(usable_dates) < 2:

        print(
            "[FII/DII DASHBOARD] "
            "Need two complete trading days "
            f"in '{TABLE_SOURCE_TAB}'. "
            f"Found {len(usable_dates)}."
        )

        return None, {}

    # --------------------------------------------------------
    # Latest and previous NSE trading dates
    # --------------------------------------------------------

    latest_date = (
        usable_dates[-1]
    )

    previous_date = (
        usable_dates[-2]
    )

    # --------------------------------------------------------
    # CHANGE =
    #
    # latest net
    # -
    # previous net
    # --------------------------------------------------------

    changes = {}

    for who in ROW_ORDER:

        latest_values = (
            nets[
                latest_date
            ].get(who)
        )

        previous_values = (
            nets[
                previous_date
            ].get(who)
        )

        if (
            not latest_values
            or not previous_values
        ):

            continue

        changes[who] = {

            "Future":
                latest_values[0]
                -
                previous_values[0],

            "CE":
                latest_values[1]
                -
                previous_values[1],

            "PE":
                latest_values[2]
                -
                previous_values[2],
        }

    print(
        "[FII/DII DASHBOARD] "
        "Participant changes calculated for "
        f"{latest_date.strftime('%d %B %Y')}"
    )

    return (
        latest_date,
        changes
    )


# ============================================================
# ACTIVITY WORDING
#
# Matches master_fiidii_website_mod1.py
# ============================================================

def _activity(
    instrument,
    change
):

    verb = (
        "Buy"
        if change > 0
        else "Sell"
    )

    if instrument == "Cash":

        return verb

    noun = {

        "Future": "Futures",

        "CE": "Call",

        "PE": "Put",

    }[instrument]

    return (
        f"{noun} {verb}"
    )


# ============================================================
# BULLISH / BEARISH LOGIC
#
# Matches master_fiidii_website_mod1.py
# ============================================================

def _is_bullish(
    instrument,
    change
):

    # --------------------------------------------------------
    # Cash / Future / CE
    #
    # Positive = Bullish
    # Negative = Bearish
    # --------------------------------------------------------

    if instrument in (
        "Cash",
        "Future",
        "CE",
    ):

        return change > 0

    # --------------------------------------------------------
    # PE
    #
    # Positive = Bearish
    # Negative = Bullish
    # --------------------------------------------------------

    return change < 0


# ============================================================
# BUILD PARTICIPANT ACTIVITY
#
# Returns:
#
#     latest_date,
#     participant_activity
# ============================================================

def _build_participant_activity(
    df_fii
):

    latest_date, changes = (
        _compute_participant_changes()
    )

    if not changes:

        return None, []

    # ========================================================
    # CASH VALUES
    #
    # These are taken from the latest FII/DII cash row.
    # ========================================================

    cash_changes = {}

    if (
        df_fii is not None
        and not df_fii.empty
    ):

        try:

            latest_cash_row = (
                df_fii
                .sort_values("Date")
                .iloc[-1]
            )

            # ------------------------------------------------
            # FII CASH
            # ------------------------------------------------

            if (
                "Net FII/FPI *"
                in df_fii.columns
            ):

                value = (
                    latest_cash_row.get(
                        "Net FII/FPI *"
                    )
                )

                try:

                    if value == value:

                        cash_changes["FII"] = (
                            _f(value)
                        )

                except Exception:
                    pass

            # ------------------------------------------------
            # DII CASH
            # ------------------------------------------------

            if (
                "Net DII **"
                in df_fii.columns
            ):

                value = (
                    latest_cash_row.get(
                        "Net DII **"
                    )
                )

                try:

                    if value == value:

                        cash_changes["DII"] = (
                            _f(value)
                        )

                except Exception:
                    pass

        except Exception as e:

            print(
                "[FII/DII DASHBOARD] "
                f"Could not read Cash values: {e}"
            )

    # ========================================================
    # BUILD EXACT ORDER
    # ========================================================

    participant_activity = []

    for who in ROW_ORDER:

        if who not in changes:
            continue

        rows_for_participant = []

        # ----------------------------------------------------
        # FII / DII Cash
        # ----------------------------------------------------

        if (
            who in CASH_PARTICIPANTS
            and who in cash_changes
        ):

            rows_for_participant.append(
                (
                    "Cash",
                    cash_changes[who]
                )
            )

        # ----------------------------------------------------
        # Future
        # ----------------------------------------------------

        rows_for_participant.append(
            (
                "Future",
                changes[who]["Future"]
            )
        )

        # ----------------------------------------------------
        # CE
        # ----------------------------------------------------

        rows_for_participant.append(
            (
                "CE",
                changes[who]["CE"]
            )
        )

        # ----------------------------------------------------
        # PE
        # ----------------------------------------------------

        rows_for_participant.append(
            (
                "PE",
                changes[who]["PE"]
            )
        )

        # ----------------------------------------------------
        # Convert to JSON records
        # ----------------------------------------------------

        for (
            instrument,
            change
        ) in rows_for_participant:

            change = round(
                float(change)
            )

            bullish = _is_bullish(
                instrument,
                change
            )

            participant_activity.append(
                {
                    "participant":
                        who,

                    "segment":
                        instrument,

                    "instrument":
                        instrument,

                    "change":
                        change,

                    "activity":
                        _activity(
                            instrument,
                            change
                        ),

                    "views":
                        (
                            "Bullish"
                            if bullish
                            else
                            "Bearish"
                        ),
                }
            )

    print(
        "[FII/DII DASHBOARD] "
        "Participant activity rows prepared: "
        f"{len(participant_activity)}"
    )

    return (
        latest_date,
        participant_activity
    )


# ============================================================
# NEON DATABASE URL
# ============================================================

def _load_database_url():

    try:

        with open(
            ENV_PATH,
            "r",
            encoding="utf-8"
        ) as f:

            for line in f:

                line = line.strip()

                if line.startswith(
                    "DATABASE_URL="
                ):

                    return (
                        line
                        .split("=", 1)[1]
                        .strip()
                        .strip('"')
                    )

    except Exception as e:

        print(
            "[NEON FII/DII] "
            f"Could not read DATABASE_URL: {e}"
        )

    return None


# ============================================================
# UPLOAD FII/DII SNAPSHOT TO NEON
# ============================================================

def _upload_fiidii_to_neon(
    payload
):

    database_url = (
        _load_database_url()
    )

    if not database_url:

        print(
            "[NEON FII/DII] "
            "DATABASE_URL not found."
        )

        print(
            "[NEON FII/DII] "
            "Local fiidii_data.json "
            "remains available."
        )

        return

    conn = None

    try:

        conn = psycopg2.connect(
            database_url
        )

        with conn.cursor() as cur:

            cur.execute(
                """
                INSERT INTO public.fiidii_data
                (
                    id,
                    as_of,
                    data,
                    updated_at
                )
                VALUES
                (
                    1,
                    %s,
                    %s::jsonb,
                    now()
                )
                ON CONFLICT (id)
                DO UPDATE SET
                    as_of =
                        EXCLUDED.as_of,
                    data =
                        EXCLUDED.data,
                    updated_at =
                        now()
                """,
                (
                    payload["asOf"].replace(
                        " IST",
                        "+05:30"
                    ),

                    json.dumps(
                        payload,
                        ensure_ascii=False
                    ),
                )
            )

        conn.commit()

        print(
            "[NEON FII/DII] "
            "Snapshot uploaded successfully."
        )

    except Exception as e:

        if conn:

            conn.rollback()

        print(
            "[NEON FII/DII] "
            f"Upload failed: {e}"
        )

        print(
            "[NEON FII/DII] "
            "Local fiidii_data.json "
            "was preserved."
        )

    finally:

        if conn:

            conn.close()


# ============================================================
# MAIN EXPORT FUNCTION
# ============================================================

def export_fiidii_json(
    df_fii,
    df_oi,
    path=FIIDII_JSON_PATH
):

    """
    Export the existing FII/DII dashboard data and
    participant activity.

    Existing sections:

        asOf
        fiidii
        fiiPctTrend
        flowTrend

    New sections:

        participantActivityDate
        participantActivity

    After the local JSON file is successfully written,
    the same payload is uploaded to Neon.
    """

    # ========================================================
    # PARTICIPANT ACTIVITY
    #
    # latest_date comes from FIIOIDATA/NSE data.
    # ========================================================

    (
        latest_date,
        participant_activity
    ) = _build_participant_activity(
        df_fii
    )

    # ========================================================
    # PAYLOAD
    # ========================================================

    payload = {

        # ----------------------------------------------------
        # This remains the JSON generation timestamp.
        # It is NOT the participant table date.
        # ----------------------------------------------------

        "asOf":
            datetime.now().strftime(
                "%d %b %Y, %H:%M:%S IST"
            ),

        # ----------------------------------------------------
        # EXISTING
        # ----------------------------------------------------

        "fiidii":
            None,

        "fiiPctTrend":
            [],

        "flowTrend":
            [],

        # ----------------------------------------------------
        # NEW:
        # ACTUAL NSE/FIIOIDATA PARTICIPANT DATE
        # ----------------------------------------------------

        "participantActivityDate":
            (
                latest_date.strftime(
                    "%d %B %Y"
                )
                if latest_date is not None
                else ""
            ),

        # ----------------------------------------------------
        # NEW:
        # PARTICIPANT TABLE DATA
        # ----------------------------------------------------

        "participantActivity":
            participant_activity,
    }

    # ========================================================
    # EXISTING FII/DII CASH DATA
    # ========================================================

    if (
        df_fii is not None
        and not df_fii.empty
    ):

        last = df_fii.iloc[-1]

        payload["fiidii"] = {

            "date":
                (
                    last["Date"]
                    .strftime(
                        "%d %b %Y"
                    )
                    if hasattr(
                        last["Date"],
                        "strftime"
                    )
                    else
                    str(
                        last["Date"]
                    )
                ),

            "buyFII":
                _f(
                    last.get(
                        "Buy FII/FPI *"
                    )
                ),

            "sellFII":
                _f(
                    last.get(
                        "Sell FII/FPI *"
                    )
                ),

            "netFII":
                _f(
                    last.get(
                        "Net FII/FPI *"
                    )
                ),

            "buyDII":
                _f(
                    last.get(
                        "Buy DII **"
                    )
                ),

            "sellDII":
                _f(
                    last.get(
                        "Sell DII **"
                    )
                ),

            "netDII":
                _f(
                    last.get(
                        "Net DII **"
                    )
                ),
        }

        # ====================================================
        # EXISTING FLOW TREND
        # ====================================================

        tail = df_fii.tail(10)

        payload["flowTrend"] = [

            [
                _date_str(
                    row["Date"]
                ),

                _f(
                    row.get(
                        "Net FII/FPI *"
                    )
                ),

                _f(
                    row.get(
                        "Net DII **"
                    )
                ),
            ]

            for _, row
            in tail.iterrows()
        ]

    # ========================================================
    # EXISTING FII FUTURES PERCENTAGE TREND
    # ========================================================

    if (
        df_oi is not None
        and not df_oi.empty
    ):

        tail = df_oi.tail(15)

        payload["fiiPctTrend"] = [

            [
                _date_str(
                    row["Date"]
                ),

                _f(
                    row.get(
                        "Future Index Long %"
                    )
                ),

                _f(
                    row.get(
                        "Future Index Short %"
                    )
                ),
            ]

            for _, row
            in tail.iterrows()
        ]

    # ========================================================
    # WRITE JSON ATOMICALLY
    # ========================================================

    tmp_path = (
        path + ".tmp"
    )

    try:

        os.makedirs(
            os.path.dirname(path),
            exist_ok=True
        )

        with open(
            tmp_path,
            "w",
            encoding="utf-8"
        ) as f:

            json.dump(
                payload,
                f,
                ensure_ascii=False,
                indent=2
            )

        os.replace(
            tmp_path,
            path
        )

        print(
            f"[FII/DII DASHBOARD] "
            f"Exported -> {path}"
        )

        print(
            "[FII/DII DASHBOARD] "
            "Participant activity date: "
            f"{payload['participantActivityDate']}"
        )

        print(
            "[FII/DII DASHBOARD] "
            "Participant activity rows: "
            f"{len(participant_activity)}"
        )

        # ====================================================
        # UPLOAD SAME SNAPSHOT TO NEON
        #
        # IMPORTANT:
        # Local JSON has already been successfully written.
        # Therefore a Neon failure cannot destroy the local
        # FII/DII workflow.
        # ====================================================

        _upload_fiidii_to_neon(
            payload
        )

    except Exception as e:

        print(
            "[FII/DII DASHBOARD] "
            f"Export failed: {e}"
        )