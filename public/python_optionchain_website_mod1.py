import time
import json
import os
import traceback
import requests
import urllib3
from datetime import datetime
import xlwings as xw
import pywintypes
import dashboard_export as dash

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ==========================================================
# CONFIG
# ==========================================================

EXCEL_FILE = r"C:\Users\TDutta\derivasense\public\optionchain_multiindex.xlsm"

VIX_SHEET_NAME = "VIX"
HEATMAP_SHEET_NAME = "heatmap"
STRATEGY_SHEET_NAME = "strategy"
STRATEGY_DATE_CELL = "F1"

NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json,text/plain,*/*",
    "Referer": "https://www.nseindia.com/option-chain"
}

NSE_OPTION_CHAIN_URL = (
    "https://www.nseindia.com/api/option-chain-v3"
    "?type=Indices&symbol={symbol}&expiry={expiry}"
)

FUTURE_URL = (
    "https://www.nseindia.com/api/liveEquity-derivatives?index={future_index}"
)

# ---- BSE (Sensex) -----------------------------------------
# BSE's API is a completely different shape from NSE's - separate
# headers, session bootstrap, expiry formatting, and (importantly)
# response JSON structure. Field names below are confirmed from a
# working reference script, not guessed.

BSE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.bseindia.com/",
    "Origin": "https://www.bseindia.com"
}

BSE_OPTION_CHAIN_URL = (
    "https://api.bseindia.com/BseIndiaAPI/api/DerivOptionChain_IV/w"
    "?Expiry={expiry}&scrip_cd={scrip_cd}&strprice=0"
)

# Futures price comes from a *different* BSE endpoint than the option
# chain - it returns a flat list of scrips (all products, not just
# Sensex), matched here by name prefix + expiry month.
BSE_FUTURE_URL = "https://api.bseindia.com/BseIndiaAPI/api/GetDeripreopenData/w"


def format_bse_expiry(expiry):
    # "31-Jul-2025" -> "31 Jul 2025" -> "31+Jul+2025"
    return expiry.replace("-", " ").replace(" ", "+")


def to_number_bse(val, is_int=False):
    # BSE's JSON mixes numbers, numeric strings, comma-formatted
    # strings, and empty strings in the same field across rows.
    #
    # Integer fields (OI, change-in-OI, volume) fall back to 0 rather
    # than "" - write_analysis() sums these columns directly
    # (sum(row[12] for row in rows) etc.), and int + "" raises
    # TypeError. Float fields (IV, LTP, price change) aren't summed
    # anywhere, so "" is fine there as a blank-display fallback.
    try:
        if val is None or val == "":
            return 0 if is_int else ""

        val = str(val).replace(",", "").strip()

        return int(float(val)) if is_int else round(float(val), 4)

    except Exception:
        return 0 if is_int else ""


def bse_session():

    s = requests.Session()
    s.headers.update(BSE_HEADERS)
    s.get("https://www.bseindia.com", timeout=15, verify=False)
    time.sleep(2)  # mirrors the working reference script - BSE seems to want this

    return s
def fetch_bse_sensex_previous_close(session):

    # ============================================================
    # BSE SENSEX GRAPH DATA API
    # ============================================================
    # This is the same API that was successfully tested separately.
    # BSE returns the response as a JSON-encoded STRING containing
    # two JSON blocks separated by "#@#".
    # The first block contains the authoritative PreClose.
    # ============================================================

    url = (
        "https://api.bseindia.com/BseIndiaAPI/api/"
        "SensexGraphData_CAS/w"
        "?index=16&flag=0&sector=&seriesid=R&frd=null&tod=null"
    )

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.bseindia.com/",
        "Origin": "https://www.bseindia.com"
    }

    try:

        # --------------------------------------------------------
        # Use the existing BSE session.
        # --------------------------------------------------------
        response = session.get(
            url,
            headers=headers,
            timeout=20,
            verify=False
        )

        if response.status_code != 200:
            print(
                f"[SENSEX] BSE Cash Index HTTP Error : "
                f"{response.status_code}"
            )
            return None

        raw = response.text.strip()

        if not raw:
            print(
                "[SENSEX] BSE Cash Index returned empty response"
            )
            return None

        # --------------------------------------------------------
        # IMPORTANT:
        #
        # BSE returns the complete payload as a JSON STRING.
        # Therefore json.loads() must be performed ONCE first.
        # --------------------------------------------------------
        try:
            decoded = json.loads(raw)

        except Exception as e:
            print(
                f"[SENSEX] BSE Cash Index JSON Error : {e}"
            )
            return None

        # --------------------------------------------------------
        # The decoded object MUST be a string.
        # --------------------------------------------------------
        if not isinstance(decoded, str):
            print(
                "[SENSEX] BSE Cash Index unexpected response "
                f"type : {type(decoded)}"
            )
            return None

        # --------------------------------------------------------
        # BSE separates SUMMARY and GRAPH DATA with #@#
        # --------------------------------------------------------
        blocks = decoded.split("#@#")

        if len(blocks) < 1:
            print(
                "[SENSEX] BSE Cash Index no JSON blocks found"
            )
            return None

        # --------------------------------------------------------
        # FIRST BLOCK = SUMMARY
        # --------------------------------------------------------
        first_block = blocks[0].strip()

        if not first_block:
            print(
                "[SENSEX] BSE Cash Index summary block empty"
            )
            return None

        try:
            summary = json.loads(first_block)

        except Exception as e:
            print(
                f"[SENSEX] BSE Cash Index Summary JSON Error : {e}"
            )
            return None

        # --------------------------------------------------------
        # SUMMARY is expected to be:
        #
        # [
        #     {
        #         "PreClose": "76152.86",
        #         "LatestVal": "76515.43",
        #         ...
        #     }
        # ]
        # --------------------------------------------------------
        if not isinstance(summary, list) or len(summary) == 0:
            print(
                "[SENSEX] BSE Cash Index summary contains no records"
            )
            return None

        row = summary[0]

        if not isinstance(row, dict):
            print(
                "[SENSEX] BSE Cash Index summary record "
                "has unexpected format"
            )
            return None

        preclose_raw = row.get("PreClose")

        if preclose_raw in (None, ""):
            print(
                "[SENSEX] BSE Cash Index PreClose not found"
            )
            return None

        # --------------------------------------------------------
        # Convert BSE value to number.
        # --------------------------------------------------------
        previous_close = to_number_bse(preclose_raw)

        if previous_close in (None, 0):
            print(
                f"[SENSEX] Invalid BSE Cash Index PreClose : "
                f"{preclose_raw}"
            )
            return None

        print(
            f"[SENSEX] BSE Cash PreviousClose = "
            f"{previous_close:.2f}"
        )

        return previous_close

    except requests.exceptions.Timeout:
        print(
            "[SENSEX] BSE Cash Index request timed out"
        )
        return None

    except requests.exceptions.RequestException as e:
        print(
            f"[SENSEX] BSE Cash Index Request Error : {e}"
        )
        return None

    except Exception as e:
        print(
            f"[SENSEX] BSE Cash Index Unexpected Error : {e}"
        )
        return None
def fetch_bse_sensex_per_change(session):
    """
    Fetch the LIVE SENSEX percentage change directly from BSE.

    BSE's live SENSEX endpoint exposes the percentage change as
    ``perchg`` (the same value displayed beside SENSEX on the BSE website).
    This is preferable to calculating the percentage change from the
    derivatives option-chain response.

    Returns:
        float | None: SENSEX percentage change versus the previous close.
    """

    url = "https://api.bseindia.com/RealTimeBseIndiaAPI/api/GetSensexData/w"

    try:
        r = session.get(
            url,
            timeout=20,
            verify=False
        )

        if r.status_code != 200:
            print(
                f"[SENSEX] BSE Live SENSEX Call Failed : "
                f"HTTP {r.status_code}"
            )
            return None

        text = r.text.strip()
        if not text:
            print("[SENSEX] BSE Live SENSEX returned empty response")
            return None

        data = r.json()

        # BSE may return a list directly or a dictionary containing the
        # SENSEX record. Support both shapes.
        records = []

        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            for key in (
                "Table",
                "Data",
                "data",
                "Table1",
                "SensexData"
            ):
                value = data.get(key)
                if isinstance(value, list):
                    records = value
                    break

            if not records:
                records = [data]

        for item in records:
            if not isinstance(item, dict):
                continue

            # Current BSE live endpoint uses ``perchg``. Keep the other
            # common spellings as safe fallbacks.
            raw_per_change = None
            for key in (
                "perchg",
                "PerChange",
                "pChange",
                "ChgPer",
                "percentChange"
            ):
                if item.get(key) not in (None, ""):
                    raw_per_change = item.get(key)
                    break

            if raw_per_change in (None, ""):
                continue

            per_change = to_number_bse(raw_per_change)

            if per_change != "" and per_change is not None:
                print(
                    f"[SENSEX LIVE PERCHANGE] "
                    f"PerChange={per_change:.2f}%"
                )
                return per_change

        print("[SENSEX] BSE Live SENSEX PerChange not found")
        return None

    except Exception as e:
        print(f"[SENSEX] BSE Live SENSEX PerChange Error : {e}")
        return None


def fetch_bse_option_chain(session, scrip_cd, expiry):

    if not expiry:
        raise ValueError("Sensex option expiry (S2) is empty")

    url = BSE_OPTION_CHAIN_URL.format(
        expiry=format_bse_expiry(expiry),
        scrip_cd=scrip_cd
    )

    r = session.get(url, timeout=20, verify=False)

    if r.status_code == 200 and r.text.strip().startswith("{"):
        return r.json()

    raise RuntimeError(f"Sensex option chain API blocked/unexpected response (status {r.status_code})")


def fetch_bse_future(session, expiry):
    # No true VWAP source here (matches the working reference script,
    # which also leaves VWAP blank for Sensex) - just a snapshot future
    # price, matched by scrip name containing the expiry month.

    if not expiry or "-" not in expiry:
        return "", ""

    expiry_month = expiry.split("-")[1].upper()

    data = None

    for attempt in range(2):

        try:
            r = session.get(BSE_FUTURE_URL, timeout=30, verify=False)
            data = r.json()
            break

        except requests.exceptions.RequestException as e:
            print(f"[SENSEX] BSE Futures Call Failed (attempt {attempt + 1}/2) : {e}")
            time.sleep(2)

    if data is None:
        print("[SENSEX] BSE Futures Unavailable This Cycle, Skipping")
        return "", ""

    for row in data:
        name = row.get("ScripName", "")
        if name.startswith("SENSEX") and expiry_month in name:
            return to_number_bse(row.get("Indiprice", "")), ""

    return "", ""


def build_option_rows_bse(oc_json):

    rows = []

    for row in oc_json.get("Table", []):

        strike = to_number_bse(row.get("Strike_Price1", ""), is_int=True)

        rows.append([
            to_number_bse(row.get("C_Open_Interest", ""), True),
            to_number_bse(row.get("C_Absolute_Change_OI", ""), True),
            to_number_bse(row.get("C_Vol_Traded", ""), True),
            to_number_bse(row.get("C_IV", "")),
            to_number_bse(row.get("C_Last_Trd_Price", "")),
            to_number_bse(row.get("C_NetChange", "")),
            strike,
            to_number_bse(row.get("NetChange", "")),
            to_number_bse(row.get("Last_Trd_Price", "")),
            to_number_bse(row.get("IV", "")),
            to_number_bse(row.get("Vol_Traded", ""), True),
            to_number_bse(row.get("Absolute_Change_OI", ""), True),
            to_number_bse(row.get("Open_Interest", ""), True)
        ])

    return rows

HEADERS_ROW = [
    "CALL OI",
    "CALL CHANGE OI",
    "CALL VOLUME",
    "CALL IV",
    "CALL LTP",
    "CALL PRICE CHANGE",
    "STRIKE PRICE",
    "PUT PRICE CHANGE",
    "PUT LTP",
    "PUT IV",
    "PUT VOLUME",
    "PUT CHANGE OI",
    "PUT OI"
]

# ==========================================================
# PER-INDEX CONFIG
#
# sheet            -> where the option chain output goes (A1:M...)
# nse_symbol       -> "symbol=" value understood by NSE's option-chain-v3 API
# future_index     -> "index=" value for liveEquity-derivatives (futures + VWAP source)
#                     NOTE: this is an undocumented/reverse-engineered NSE endpoint.
#                     "nse50_fut" (NIFTY), "nifty_bank_fut" (BANKNIFTY), and
#                     "finnifty_fut" (FINNIFTY) are all confirmed working, taken
#                     directly from the user's actual working scripts.
# strike_step      -> ATM strike spacing used to build the +/-7 strike ladder
# source           -> "nse" (works out of the box) or "bse" (not implemented -
#                     Sensex is a BSE index, NSE has no option chain for it)
# ==========================================================

SYMBOL_CONFIGS = [
    {
        "symbol": "NIFTY",
        "sheet": "Sheet1",
        "nse_symbol": "NIFTY",
        "future_index": "nse50_fut",
        "strike_step": 50,
        "source": "nse",
    },
    {
        "symbol": "BANKNIFTY",
        "sheet": "Sheet2",
        "nse_symbol": "BANKNIFTY",
        "future_index": "nifty_bank_fut",  # confirmed working
        "strike_step": 100,
        "source": "nse",
    },
    {
        "symbol": "FINNIFTY",
        "sheet": "Sheet3",
        "nse_symbol": "FINNIFTY",
        "future_index": "finnifty_fut",  # VERIFY before relying on this
        "strike_step": 50,
        "source": "nse",
    },
    {
        "symbol": "SENSEX",
        "sheet": "Sheet4",
        "nse_symbol": None,
        "future_index": None,
        "strike_step": 100,
        "source": "bse",
        "scrip_cd": "1",  # confirmed from the user's draft script
    },
]

# ==========================================================
# PER-SYMBOL RUNTIME STATE
# (previously module-level globals; now keyed by symbol so each
#  index tracks its own VWAP accumulation / ATM ladder / reset date)
# ==========================================================

STATE = {
    cfg["symbol"]: {
        "prev_volume": None,
        "vwap_pv_sum": 0.0,
        "vwap_vol_sum": 0.0,
        "last_reset_date": None,
        "atm_strikes": [],
    }
    for cfg in SYMBOL_CONFIGS
}

# VIX sheet's own run-state (separate from the per-symbol STATE above)
VIX_STATE = {
    "data_cleared": False,
    "row": None,
}

# NIFTY strategy sheet's own run-state (log row cursor)
STRATEGY_STATE = {
    "row": None,
}

# ==========================================================
# DATE FUNCTIONS
# ==========================================================

def parse_date_to_obj(value):

    if value is None:
        return None

    if hasattr(value, "date"):
        return value.date()

    value = str(value).strip()

    for fmt in (
        "%d-%b-%Y",
        "%d-%m-%Y",
        "%Y-%m-%d"
    ):
        try:
            return datetime.strptime(value, fmt).date()
        except:
            pass

    return None


def normalize_for_compare(value):

    d = parse_date_to_obj(value)

    if d:
        return d.isoformat()

    return None

# ==========================================================
# EXCEL (single shared connection for everything, including VIX)
# ==========================================================

_WB = None  # cached workbook connection, reused across the whole run


def clear_range_with_retry(rng, attempts=3, delay=1.5, label=""):
    """
    Wraps .clear_contents() with a few short retries before giving up.

    Excel intermittently refuses ALL external COM calls for a second or
    two - typically while a cell is in edit mode (formula bar active),
    a dialog/prompt is open, or OneDrive/SharePoint AutoSave is mid-sync -
    and is almost always free again within a couple seconds. Without a
    retry, one of these transient hiccups costs an entire 180s cycle's
    worth of data for every sheet, even though Excel is usually fine again
    by the very next cycle anyway. This just closes that gap.

    Raises the original pywintypes.com_error if every attempt fails, so
    the existing diagnostic/logging around each call site still runs.
    """
    last_err = None
    for attempt in range(1, attempts + 1):
        try:
            rng.clear_contents()
            return
        except pywintypes.com_error as e:
            last_err = e
            print(f"COM Error Clearing {label} (attempt {attempt}/{attempts}) : {e}")
            if attempt < attempts:
                time.sleep(delay)
    raise last_err


def get_wb():
    """
    Returns a live xlwings Book connection, opening it only once instead
    of once per function call. Re-opens automatically if the cached
    connection has gone stale (e.g. Excel was closed/crashed mid-run).
    """

    global _WB

    if _WB is not None:
        try:
            _ = _WB.name  # touch the COM object; raises if it's dead
            return _WB
        except Exception:
            _WB = None

    if not os.path.exists(EXCEL_FILE):
        raise FileNotFoundError(f"EXCEL_FILE not found: {EXCEL_FILE}")

    try:
        _WB = xw.Book(EXCEL_FILE)
    except Exception:
        # Fall back to launching a visible Excel instance explicitly and
        # opening the file through it - sometimes avoids the
        # AccessibleObjectFromWindow COM quirk that xw.Book() alone hits.
        app = xw.App(visible=True)
        _WB = app.books.open(EXCEL_FILE)

    # Suppress alert dialogs (format warnings, link-update prompts, etc.)
    # A blocked dialog waiting for a click causes every subsequent COM
    # call to fail with a generic "Exception occurred" error until it's
    # manually dismissed - this prevents that entirely.
    try:
        _WB.app.display_alerts = False
        _WB.app.api.AskToUpdateLinks = False
    except Exception as e:
        print(f"Warning : Could Not Suppress Excel Alerts : {e}")

    print("Excel Connected. Workbook Path :", _WB.fullname)

    return _WB

def read_cell(sheet_name, cell):

    wb = get_wb()

    ws = wb.sheets[sheet_name]

    return ws.range(cell).value


def write_market_data(sheet_name, spot, future, vwap):

    wb = get_wb()
    ws = wb.sheets[sheet_name]

    ws.range("O2").value = spot
    ws.range("P2").value = future
    ws.range("Q2").value = vwap


def write_option_chain(sheet_name, rows):

    wb = get_wb()
    ws = wb.sheets[sheet_name]

    # headers
    ws.range("A1:M1").value = [HEADERS_ROW]

    # clear old data
    try:
        clear_range_with_retry(ws.range("A2:M500"), label=sheet_name)
    except pywintypes.com_error as e:
        print(f"COM Error Clearing {sheet_name} (all retries failed) : {e}")

        try:
            if wb.api.ReadOnly:
                print(f"Warning : Workbook Is Open As Read-Only")
        except Exception:
            pass

        try:
            if ws.api.ProtectContents:
                print(f"Warning : {sheet_name} Has Protection Enabled")
        except Exception:
            pass

        print(
            "This usually means a blocking Excel dialog is open (format "
            "warning, macro security prompt, OneDrive sync conflict, etc.) "
            "- check the Excel window and dismiss any pending dialog."
        )

        raise

    if not rows:
        return

    # write all rows at once
    ws.range("A2").value = rows


def analysis_sheet_name(symbol):
    return f"analysis_{symbol}"


def strike_coi_sheet_name(symbol):
    return f"strike_coi_{symbol}"


def strike_oi_sheet_name(symbol):
    return f"strike_oi_{symbol}"


def clear_analysis_if_new_day(symbol):

    state = STATE[symbol]

    wb = get_wb()

    try:
        ws = wb.sheets[analysis_sheet_name(symbol)]
    except:
        return

    last_row = ws.range(
        "A" + str(ws.cells.last_cell.row)
    ).end("up").row

    if last_row < 2:
        return

    last_saved_date = ws.range(
        f"M{last_row}"
    ).value

    if last_saved_date is None:
        return

    if hasattr(last_saved_date, "date"):
        last_saved_date = last_saved_date.date()

    today = datetime.now().date()

    if last_saved_date != today:

        ws.range("A2:M500").clear_contents()

        try:
            ws_coi = wb.sheets[strike_coi_sheet_name(symbol)]
            ws_coi.range("A3:AE500").clear_contents()
            ws_coi.range("B1").clear_contents()
        except:
            pass

        try:
            ws_oi = wb.sheets[strike_oi_sheet_name(symbol)]
            ws_oi.range("A3:AE500").clear_contents()
            ws_oi.range("B1").clear_contents()
        except:
            pass

        state["atm_strikes"] = []

        print(
            f"[{symbol}] New Day Detected. Old data cleared. "
            f"Previous date={last_saved_date}"
        )


def write_analysis(symbol, rows, spot, future, vwap):

    if not rows:
        return

    wb = get_wb()

    sheet_name = analysis_sheet_name(symbol)

    try:
        ws = wb.sheets[sheet_name]
    except:
        ws = wb.sheets.add(sheet_name)

    ws.range("A1:M1").value = [[
        "TIME",
        "PUT OI SUM",
        "CALL OI SUM",
        "CHANGE OF OI SUM",
        "PUT COI SUM",
        "CALL COI SUM",
        "CHANGE OF COI SUM",
        "PCR (OI)",
        "PCR (COI)",
        "FUTURE PRICE",
        "VWAP",
        f"SPOT {symbol}",
        "DATE"
    ]]

    put_oi_sum = sum(row[12] for row in rows)
    call_oi_sum = sum(row[0] for row in rows)

    put_coi_sum = sum(row[11] for row in rows)
    call_coi_sum = sum(row[1] for row in rows)

    change_oi_sum = put_oi_sum - call_oi_sum
    change_coi_sum = put_coi_sum - call_coi_sum

    pcr_oi = put_oi_sum / call_oi_sum if call_oi_sum else 0
    pcr_coi = put_coi_sum / call_coi_sum if call_coi_sum else 0

    last_row = ws.range(
        "A" + str(ws.cells.last_cell.row)
    ).end("up").row

    next_row = 2 if last_row < 2 else last_row + 1

    ws.range(f"A{next_row}").value = [[
        datetime.now().strftime("%H:%M"),
        put_oi_sum,
        call_oi_sum,
        change_oi_sum,
        put_coi_sum,
        call_coi_sum,
        change_coi_sum,
        round(pcr_oi, 10),
        round(pcr_coi, 10),
        future,
        vwap,
        spot,
        datetime.now()
    ]]

# ==========================================================
# STRIKE SELECTION
# ==========================================================

def initialize_atm_strikes(symbol, spot, strike_step):

    state = STATE[symbol]

    if state["atm_strikes"]:
        return

    atm = round(float(spot) / strike_step) * strike_step

    strikes = [atm + (i * strike_step) for i in range(-7, 8)]

    state["atm_strikes"] = strikes

    wb = get_wb()

    coi_name = strike_coi_sheet_name(symbol)
    oi_name = strike_oi_sheet_name(symbol)

    try:
        ws = wb.sheets[coi_name]
    except:
        ws = wb.sheets.add(coi_name)

    try:
        ws2 = wb.sheets[oi_name]
    except:
        ws2 = wb.sheets.add(oi_name)

    ws.range("B1").value = atm
    ws2.range("B1").value = atm

    ws.range("A2").value = "TIME"
    ws2.range("A2").value = "TIME"

    ws.range("B2:P2").value = [strikes]
    ws2.range("B2:P2").value = [strikes]

    ws.range("Q2:AE2").value = [strikes]
    ws2.range("Q2:AE2").value = [strikes]

    print(f"[{symbol}] ATM Fixed For Day =", atm)


def write_strike_coi_data(symbol, rows):

    state = STATE[symbol]

    if not state["atm_strikes"] or not rows:
        return

    wb = get_wb()

    try:
        ws = wb.sheets[strike_coi_sheet_name(symbol)]
    except:
        return

    strike_map = {}

    for row in rows:
        strike = row[6]
        strike_map[strike] = {
            "call_coi": row[1],
            "put_coi": row[11]
        }

    last_row = ws.range(
        "A" + str(ws.cells.last_cell.row)
    ).end("up").row

    next_row = 3 if last_row < 3 else last_row + 1

    output = [datetime.now().strftime("%H:%M")]

    for strike in state["atm_strikes"]:
        output.append(strike_map.get(strike, {}).get("call_coi", 0))

    for strike in state["atm_strikes"]:
        output.append(strike_map.get(strike, {}).get("put_coi", 0))

    ws.range(f"A{next_row}").value = [output]


def write_strike_oi_data(symbol, rows):

    state = STATE[symbol]

    if not state["atm_strikes"] or not rows:
        return

    wb = get_wb()

    try:
        ws = wb.sheets[strike_oi_sheet_name(symbol)]
    except:
        return

    strike_map = {}

    for row in rows:
        strike = row[6]
        strike_map[strike] = {
            "call_oi": row[0],
            "put_oi": row[12]
        }

    last_row = ws.range(
        "A" + str(ws.cells.last_cell.row)
    ).end("up").row

    next_row = 3 if last_row < 3 else last_row + 1

    output = [datetime.now().strftime("%H:%M")]

    for strike in state["atm_strikes"]:
        output.append(strike_map.get(strike, {}).get("call_oi", 0))

    for strike in state["atm_strikes"]:
        output.append(strike_map.get(strike, {}).get("put_oi", 0))

    ws.range(f"A{next_row}").value = [output]

# ==========================================================
# STRATEGY SHEET (NIFTY-only: fixed ATM strike + Call/Put COI sum
# across the 5 strikes centered on ATM - ATM-2, ATM-1, ATM, ATM+1, ATM+2)
# ==========================================================

def write_nifty_strategy_data(symbol, rows):

    if symbol != "NIFTY":
        return

    state = STATE[symbol]

    if not state["atm_strikes"] or not rows:
        return

    wb = get_wb()

    try:
        ws = wb.sheets[STRATEGY_SHEET_NAME]
    except:
        ws = wb.sheets.add(STRATEGY_SHEET_NAME)

    strikes = state["atm_strikes"]

    # strikes is built as [atm + i*step for i in range(-7, 8)], so the
    # middle element (index 7 of 15) is always the ATM strike itself.
    mid = len(strikes) // 2
    atm_strike = strikes[mid]

    surrounding = strikes[mid - 2: mid + 3]  # ATM-2 .. ATM+2 (5 strikes)

    strike_map = {row[6]: row for row in rows}

    call_coi_sum = 0
    put_coi_sum = 0

    for s in surrounding:
        row = strike_map.get(s)
        if row:
            call_coi_sum += row[1] or 0   # CALL CHANGE OI
            put_coi_sum += row[11] or 0   # PUT CHANGE OI

    ws.range("A1").value = "ATM STRIKE"
    ws.range("B1").value = atm_strike

    ws.range("C1").value = "CALL COI SUM (ATM +/-2)"
    ws.range("D1").value = "PUT COI SUM (ATM +/-2)"
    ws.range("E1").value = "PUT COI - CALL COI"

    stored_date_val = ws.range(STRATEGY_DATE_CELL).value

    stored_date = None
    if stored_date_val is not None:
        if hasattr(stored_date_val, "date"):
            stored_date = stored_date_val.date()
        else:
            stored_date = parse_date_to_obj(stored_date_val)

    today = datetime.now().date()

    if stored_date != today:
        ws.range("B2:E100").clear_contents()
        ws.range(STRATEGY_DATE_CELL).value = today.isoformat()
        STRATEGY_STATE["row"] = 2
        print("[NIFTY] Strategy Log Reset For New Day")

    elif STRATEGY_STATE["row"] is None:
        last_row = ws.range("C" + str(ws.cells.last_cell.row)).end("up").row
        STRATEGY_STATE["row"] = 2 if last_row < 2 else last_row + 1
        print(f"[NIFTY] Resuming Strategy Log From Row {STRATEGY_STATE['row']} (Same Day)")

    row = STRATEGY_STATE["row"]

    if row <= 100:
        ws.range(f"B{row}").value = datetime.now().strftime("%H:%M:%S")
        ws.range(f"C{row}").value = call_coi_sum
        ws.range(f"D{row}").value = put_coi_sum
        ws.range(f"E{row}").value = put_coi_sum - call_coi_sum
        STRATEGY_STATE["row"] += 1
    else:
        print("[NIFTY] Strategy Log Reached Row 100, No Further Rows Written")

    print(
        f"[NIFTY] Strategy Sheet Updated : ATM={atm_strike}, "
        f"CallCOI={call_coi_sum}, PutCOI={put_coi_sum}"
    )


def recover_nifty_atm_if_same_day():
    """
    initialize_atm_strikes() only skips recomputing ATM if STATE['NIFTY']
    ['atm_strikes'] is already populated in memory - which is empty on
    every fresh script start, so a restart mid-day would otherwise
    recompute ATM from whatever the spot price is *right now*, not the
    fixed morning value. This restores the ladder from the strategy
    sheet first (if it was already set today) so that doesn't happen.
    """

    try:
        wb = get_wb()

        try:
            ws = wb.sheets[STRATEGY_SHEET_NAME]
        except:
            return

        stored_date_val = ws.range(STRATEGY_DATE_CELL).value

        stored_date = None
        if stored_date_val is not None:
            if hasattr(stored_date_val, "date"):
                stored_date = stored_date_val.date()
            else:
                stored_date = parse_date_to_obj(stored_date_val)

        if stored_date != datetime.now().date():
            return

        atm_value = ws.range("B1").value

        if not atm_value:
            return

        strike_step = next(
            cfg["strike_step"] for cfg in SYMBOL_CONFIGS if cfg["symbol"] == "NIFTY"
        )

        atm = int(round(float(atm_value)))
        strikes = [atm + (i * strike_step) for i in range(-7, 8)]

        STATE["NIFTY"]["atm_strikes"] = strikes

        print(f"[NIFTY] Recovered Fixed ATM From Strategy Sheet (same day) : ATM={atm}")

    except Exception as e:
        print(f"Error Recovering NIFTY ATM : {e}")

# ==========================================================
# NSE (option chain + futures - unchanged from the working script)
# ==========================================================

def nse_session():

    s = requests.Session()
    s.headers.update(NSE_HEADERS)
    s.get("https://www.nseindia.com", timeout=10)

    return s


def fetch_option_chain(session, nse_symbol, expiry):

    url = NSE_OPTION_CHAIN_URL.format(
        symbol=nse_symbol,
        expiry=expiry
    )

    r = session.get(url, timeout=20)
    r.raise_for_status()

    return r.json()


def fetch_future(session, future_index):

    url = FUTURE_URL.format(future_index=future_index)

    r = session.get(url, timeout=20)
    r.raise_for_status()

    return r.json()

# ==========================================================
# NSE (VIX + NIFTY spot, via allIndices - needs a fuller browser-style
# session flow since this endpoint is more aggressively bot-checked
# than option-chain-v3)
# ==========================================================

NSE_BASE_URL = "https://www.nseindia.com"
NSE_DATA_PAGE_URL = "https://www.nseindia.com/market-data/live-market-indices"
NSE_INDICES_URL = "https://www.nseindia.com/api/allIndices"

VIX_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

VIX_HEADERS_HTML = {
    "User-Agent": VIX_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}

VIX_HEADERS_API = {
    "User-Agent": VIX_USER_AGENT,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": NSE_DATA_PAGE_URL,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "X-Requested-With": "XMLHttpRequest",
}

vix_nse_session = requests.Session()
vix_nse_session.trust_env = False
vix_nse_session.proxies = {"http": None, "https": None}


def refresh_vix_nse_session():

    try:

        vix_nse_session.headers.update(VIX_HEADERS_HTML)

        home_resp = vix_nse_session.get(NSE_BASE_URL, timeout=10, verify=False)

        time.sleep(1)

        page_resp = vix_nse_session.get(NSE_DATA_PAGE_URL, timeout=10, verify=False)

        print(
            f"VIX NSE Session Refresh : home_status={home_resp.status_code}, "
            f"page_status={page_resp.status_code}"
        )

        vix_nse_session.headers.update(VIX_HEADERS_API)

        return page_resp.status_code == 200

    except Exception as e:

        print(f"Error Refreshing VIX NSE Session : {e}")

        return False


def fetch_vix_and_nifty():
    """
    Returns (vix_value, nifty_value, index_snapshot).

    index_snapshot is new: a dict of {NSE_INDEX_NAME: {"last":, "change":,
    "pChange":}} for every index in this same response - NSE's allIndices
    endpoint already returns true change-vs-previous-close for every index
    in one call, it just wasn't being kept before. This lets the dashboard
    show the REAL day change instead of "change since the script started
    tracking today" (which is wrong if the script wasn't running from
    market open - e.g. starting at 10:30 instead of 9:15 means the first
    captured spot becomes the reference point, not the actual previous
    close, so the displayed % change understates the real move).
    """

    try:

        response = vix_nse_session.get(NSE_INDICES_URL, timeout=10, verify=False)

        if response.status_code != 200:
            refresh_vix_nse_session()
            response = vix_nse_session.get(NSE_INDICES_URL, timeout=10, verify=False)

        response.raise_for_status()

        data = response.json()

        vix_value = None
        nifty_value = None
        index_snapshot = {}

        for index in data.get("data", []):

            name = index.get("index", "").upper()

            # NSE's allIndices schema has used different field names across
            # versions/endpoints ("change" vs "variation", "percentChange"
            # vs "pChange") - check both so this doesn't silently fail if
            # the exact key differs from what was originally assumed.
            index_snapshot[name] = {
                "last": index.get("last"),
                "change": index.get("change", index.get("variation")),
                "pChange": index.get("percentChange", index.get("pChange")),
            }

            if name == "INDIA VIX":
                vix_value = float(index.get("last"))

            elif name == "NIFTY 50":
                nifty_value = float(index.get("last"))

        # Diagnostic: confirms whether each name we rely on was actually
        # found in this response with usable change/pChange fields. If any
        # of these print "NOT FOUND", that symbol silently falls back to
        # the old "change since script started" behavior instead of the
        # real day change. "NIFTY FINANCIAL SERVICES" confirmed correct
        # for FINNIFTY via an earlier run of this same diagnostic.
        for check_name in ("NIFTY 50", "NIFTY BANK", "NIFTY FINANCIAL SERVICES", "INDIA VIX"):
            snap = index_snapshot.get(check_name)
            if snap and snap["change"] is not None:
                print(f"[TRUE CHANGE] {check_name} : chg={snap['change']} pChange={snap['pChange']}")
            else:
                print(f"[TRUE CHANGE] {check_name} : NOT FOUND - raw entry: {snap}")

        return vix_value, nifty_value, index_snapshot

    except Exception as e:

        print(f"Error Fetching VIX/NIFTY : {e}")

        return None, None, {}

# ==========================================================
# VIX SHEET - EXCEL HELPERS (shares the same wb connection as
# everything else, so there's only ever one Excel COM connection open)
# ==========================================================

# Cell used to persist "last active date" for the VIX sheet, so a
# fresh script start mid-day can still detect and clear stale data
# left over from a previous trading day.
VIX_DATE_CELL = "N4"


def ensure_vix_fresh_for_today():

    try:
        wb = get_wb()
        ws = wb.sheets[VIX_SHEET_NAME]

        stored_value = ws.range(VIX_DATE_CELL).value

        # Excel auto-converts a date-looking string into an actual date
        # value when written to a cell, so this reads back as a datetime
        # object, not the original string. Normalize both sides to plain
        # date objects before comparing - comparing a datetime to a string
        # with != is always True, which was silently clearing every cycle.
        stored_date = None

        if stored_value is not None:
            if hasattr(stored_value, "date"):
                stored_date = stored_value.date()
            else:
                stored_date = parse_date_to_obj(stored_value)

        today = datetime.now().date()

        if stored_date != today:

            print(
                f"[VIX] New Trading Day Detected (stored={stored_date}, today={today}). "
                "Clearing stale data."
            )

            cleared_ok = clear_old_vix_data()

            if cleared_ok:
                # Only mark the day as "handled" if the clear actually
                # worked. If it failed (e.g. Excel busy right at this
                # moment), leave the stored date alone - the next cycle
                # will see the same mismatch and retry the clear, instead
                # of silently writing today's rows on top of yesterday's
                # leftover data.
                ws.range(VIX_DATE_CELL).value = today.isoformat()
                VIX_STATE["row"] = 4
                VIX_STATE["data_cleared"] = True
            else:
                print(
                    "[VIX] Clear failed - NOT marking today as handled, "
                    "will retry next cycle."
                )

    except Exception as e:
        print(f"Error Checking VIX New Day : {e}")


def get_next_vix_row():

    try:
        wb = get_wb()
        ws = wb.sheets[VIX_SHEET_NAME]

        last_row = ws.range(
            "K" + str(ws.cells.last_cell.row)
        ).end("up").row

        return 4 if last_row < 4 else last_row + 1

    except Exception as e:
        print(f"Error Finding Next VIX Row : {e}")
        return 4


def clear_old_vix_data():
    """
    Returns True if the clear actually succeeded, False otherwise. The
    caller (ensure_vix_fresh_for_today) needs this - if it can't tell the
    clear failed, it marks the day as "handled" anyway, which lets today's
    rows get written on top of yesterday's leftover data instead of a
    clean sheet.
    """

    try:
        wb = get_wb()
        ws = wb.sheets[VIX_SHEET_NAME]

        if wb.api.ReadOnly:
            print("Warning : Workbook Is Open As Read-Only")

        try:
            if ws.api.ProtectContents:
                print("Warning : VIX Worksheet Has Protection Enabled")
        except Exception:
            pass

        clear_range_with_retry(ws.range("K4:M300"), label=VIX_SHEET_NAME)

        print("Old VIX & NIFTY Data Cleared Successfully")
        return True

    except Exception as e:
        print(f"Error Clearing VIX Data : {e}")
        return False


def write_vix_row(row, current_time, vix_value, nifty_spot):

    try:
        wb = get_wb()
        ws = wb.sheets[VIX_SHEET_NAME]

        ws.range(f"K{row}").value = current_time
        ws.range(f"L{row}").value = vix_value
        ws.range(f"M{row}").value = nifty_spot

        print(
            f"[VIX] Updated Row {row} : "
            f"Time={current_time}, VIX={vix_value}, NIFTY={nifty_spot}"
        )

    except Exception as e:
        print(f"Error Writing VIX Row : {e}")


def update_vix_sheet(now):

    ensure_vix_fresh_for_today()

    current_time = now.strftime("%H:%M:%S")

    # Fetch VIX + true change data unconditionally, regardless of whether
    # the market is open right now. NSE's allIndices snapshot still
    # reflects the last trading session's close-to-close change on
    # weekends/holidays and outside market hours - same as Zerodha shows.
    # Only the *write into the VIX Excel sheet* below should be gated to
    # market hours (we don't want to log a stream of VIX rows when the
    # market isn't actually trading) - the true-change fetch itself must
    # not be, or the dashboard's % change silently reverts to the "since
    # script started" fallback on any day the script starts before/after
    # hours or on a non-trading day.
    vix_value, nifty_spot, index_snapshot = fetch_vix_and_nifty()
    dash.update_vix_dashboard(vix_value, nifty_spot, index_snapshot)
    dash.update_true_changes(index_snapshot)

    if not is_market_open(now):

        print(f"[VIX] Market Closed : {current_time}")

        if not VIX_STATE["data_cleared"]:
            if clear_old_vix_data():
                VIX_STATE["data_cleared"] = True
                VIX_STATE["row"] = 4
            # else: leave data_cleared False so this retries next cycle
            # instead of giving up after one failed attempt

        return

    VIX_STATE["data_cleared"] = False

    if VIX_STATE["row"] is None:
        VIX_STATE["row"] = get_next_vix_row()
        print(f"[VIX] Starting From Row : {VIX_STATE['row']}")

    if vix_value is not None or nifty_spot is not None:
        write_vix_row(VIX_STATE["row"], current_time, vix_value, nifty_spot)
        VIX_STATE["row"] += 1
    else:
        print("[VIX] No VIX or NIFTY Value Found")

# ==========================================================
# NSE (Heatmap / Gainers-Losers / ETF / Market Stats)
# Ported from the working Google Sheets script - keeps its own
# dedicated session with the exact headers that were already
# confirmed working, rather than reusing the option-chain session.
# ==========================================================

HEATMAP_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    "Referer": "https://www.nseindia.com/"
}

MOST_ACTIVE_CONTRACTS_URL = (
    "https://www.nseindia.com/api/snapshot-derivatives-equity?index=contracts&limit=20"
)
MOST_ACTIVE_CONTRACTS_PAGE = "https://www.nseindia.com/market-data/most-active-contracts"

heatmap_session = requests.Session()
heatmap_session.trust_env = False
heatmap_session.proxies = {"http": None, "https": None}


def init_heatmap_session():

    try:
        heatmap_session.get(
            "https://www.nseindia.com",
            headers=HEATMAP_HEADERS,
            timeout=10,
            verify=False,
        )

        heatmap_session.get(
            MOST_ACTIVE_CONTRACTS_PAGE,
            headers=HEATMAP_HEADERS,
            timeout=10,
            verify=False,
        )

        print("Heatmap NSE Session Initialized")
    except Exception as e:
        print(f"Error Initializing Heatmap Session : {e}")


def get_sector_data():
    url = "https://www.nseindia.com/api/heatmap-index?type=Sectoral%20Indices"
    return heatmap_session.get(url, headers=HEATMAP_HEADERS, timeout=15, verify=False).json()


def get_market_snapshot(type_code):
    url = f"https://www.nseindia.com/api/NextApi/apiClient?functionName=getMarketSnapshot&&type={type_code}"
    return heatmap_session.get(url, headers=HEATMAP_HEADERS, timeout=15, verify=False).json()


def get_market_stats():
    url = "https://www.nseindia.com/api/NextApi/apiClient?functionName=getMarketStatistics"
    return heatmap_session.get(url, headers=HEATMAP_HEADERS, timeout=15, verify=False).json()


def fetch_most_active_contracts():

    headers = dict(HEATMAP_HEADERS)
    headers["Referer"] = MOST_ACTIVE_CONTRACTS_PAGE

    try:
        r = heatmap_session.get(
            MOST_ACTIVE_CONTRACTS_URL, headers=headers, timeout=15, verify=False
        )
        r.raise_for_status()
        return r.json()

    except Exception as e:
        print(f"Error Fetching Most Active Contracts : {e}")
        return None


def format_contract_label(row):
    # e.g. "NIFTY 04AUG26 24400.00 CE" / "... FUT" for futures rows

    underlying = row.get("underlying", "")
    expiry = row.get("expiryDate", "")
    strike = row.get("strikePrice")
    option_type = row.get("optionType")

    try:
        expiry_fmt = datetime.strptime(expiry, "%d-%b-%Y").strftime("%d%b%y").upper()
    except Exception:
        expiry_fmt = str(expiry).upper().replace("-", "")

    if option_type == "Call":
        return f"{underlying} {expiry_fmt} {strike:.2f} CE"
    elif option_type == "Put":
        return f"{underlying} {expiry_fmt} {strike:.2f} PE"
    else:
        return f"{underlying} {expiry_fmt} FUT"


def approx_contract_change(row):
    # NSE's snapshot-derivatives-equity response only gives lastPrice and
    # pChange (%), not the absolute change shown on the website - this
    # backs it out algebraically. Rounding on NSE's side means this can be
    # off by a paisa or two versus the site's own displayed CHNG column.

    last_price = row.get("lastPrice")
    p_change = row.get("pChange")

    try:
        if last_price is None or p_change is None:
            return ""

        denom = 1 + (p_change / 100)

        if denom == 0:
            return ""

        prev_close = last_price / denom

        return round(last_price - prev_close, 2)

    except Exception:
        return ""


def most_active_rows(records):

    rows = []

    for r in records:
        rows.append([
            format_contract_label(r),
            r.get("lastPrice"),
            approx_contract_change(r),
            round(r.get("pChange", 0), 2) if r.get("pChange") is not None else "",
        ])

    return rows


def update_heatmap_sheet():

    wb = get_wb()
    ws = wb.sheets[HEATMAP_SHEET_NAME]

    # Full-sheet clear (matches the original gspread sheet.clear() behavior)
    clear_range_with_retry(ws, label=HEATMAP_SHEET_NAME)

    row = 1

    # ===== SECTOR HEATMAP =====
    sector = get_sector_data()

    ws.range(f"A{row}").value = [["SECTOR HEATMAP"]]
    row += 1

    data = [["Sector", "Value", "% Change"]]
    for s in sector:
        data.append([s['index'], s['current'], s['pChange']])

    ws.range(f"A{row}").value = data
    row += len(data) + 2

    # ===== TOP GAINERS =====
    g = get_market_snapshot("G")['data']

    ws.range(f"A{row}").value = [["TOP GAINERS"]]
    row += 1

    gainers = [["Symbol", "Price", "% Change"]]
    for x in g['topGainers']:
        gainers.append([x['symbol'], x['lastPrice'], round(x['pchange'], 2)])

    ws.range(f"A{row}").value = gainers
    row += len(gainers) + 2

    # ===== TOP LOSERS =====
    l = get_market_snapshot("L")['data']
    dash.update_heatmap_dashboard(sector, g['topGainers'], l['topLoosers'])


    ws.range(f"A{row}").value = [["TOP LOSERS"]]
    row += 1

    losers = [["Symbol", "Price", "% Change"]]
    for x in l['topLoosers']:
        losers.append([x['symbol'], x['lastPrice'], round(x['pchange'], 2)])

    ws.range(f"A{row}").value = losers
    row += len(losers) + 2

    # ===== ETF WATCH =====
    ew = get_market_snapshot("EW")['data']

    ws.range(f"A{row}").value = [["ETF WATCH"]]
    row += 1

    etf = [["Symbol", "Price", "% Change"]]
    for x in ew['etfWatchValue']:
        etf.append([x['symbol'], x['lastPrice'], round(x['pchange'], 2)])

    ws.range(f"A{row}").value = etf
    row += len(etf) + 2

    # ===== MOST ACTIVE VALUE =====
    mav = get_market_snapshot("MAVA")['data']

    ws.range(f"A{row}").value = [["MOST ACTIVE VALUE"]]
    row += 1

    mav_data = [["Symbol", "Price", "% Change"]]
    for x in mav['mostActiveValue']:
        mav_data.append([x['symbol'], x['lastPrice'], round(x['pchange'], 2)])

    ws.range(f"A{row}").value = mav_data
    row += len(mav_data) + 2

    # ===== MOST ACTIVE VOLUME =====
    mavo = get_market_snapshot("MAVO")['data']

    ws.range(f"A{row}").value = [["MOST ACTIVE VOLUME"]]
    row += 1

    mavo_data = [["Symbol", "Price", "% Change"]]
    for x in mavo['mostActiveVolume']:
        mavo_data.append([x['symbol'], x['lastPrice'], round(x['pchange'], 2)])

    ws.range(f"A{row}").value = mavo_data
    row += len(mavo_data) + 2

    # ===== MARKET STATS =====
    stats = get_market_stats()['data']

    ws.range(f"A{row}").value = [["MARKET STATS"]]
    row += 1

    stats_data = [
        ["Advances", stats['snapshotCapitalMarket']['advances']],
        ["Declines", stats['snapshotCapitalMarket']['declines']],
        ["Unchanged", stats['snapshotCapitalMarket']['unchange']],
        ["52W High", stats['fiftyTwoWeek']['high']],
        ["52W Low", stats['fiftyTwoWeek']['low']]
    ]

    ws.range(f"A{row}").value = stats_data

    row += len(stats_data) + 2

    # ===== MOST ACTIVE CONTRACTS (Calls / Puts / by OI) =====
    most_active_data = fetch_most_active_contracts()

    # Export cash-market breadth + most-active stocks EVERY cycle, independent
    # of whether the derivatives endpoint returned data this cycle. This prevents
    # stale breadth/stock tables when only the option-contract request fails.
    try:
        dash.update_market_stats_dashboard(
            stats,
            [], [], [],
            most_active_value=mav.get("mostActiveValue", []),
            most_active_volume=mavo.get("mostActiveVolume", []),
        )
    except Exception as e:
        print(f"[DASHBOARD] Cash-market export warning: {e}")

    if most_active_data:

        volume_data = most_active_data.get("volume", {}).get("data", []) or []

        calls = [r for r in volume_data if r.get("optionType") == "Call"][:5]
        puts = [r for r in volume_data if r.get("optionType") == "Put"][:5]

        # Prefer a dedicated "oi" list if NSE's response includes one;
        # otherwise fall back to re-sorting what we already have by OI.
        # NOTE: the fallback only covers option contracts pulled into the
        # volume-sorted list above - it won't surface futures contracts
        # (e.g. "NIFTY AUG FUT") the way NSE's own OI tab sometimes does.
        oi_source = most_active_data.get("oi", {}).get("data")

        if not oi_source:
            oi_source = sorted(
                volume_data, key=lambda r: r.get("openInterest", 0), reverse=True
            )

        by_oi = oi_source[:5]

        dash.update_market_stats_dashboard(
            stats, most_active_rows(calls), most_active_rows(puts), most_active_rows(by_oi),
            most_active_value=mav.get("mostActiveValue", []),
            most_active_volume=mavo.get("mostActiveVolume", []),
        )

        section_header = [["CONTRACT", "LTP", "CHNG", "%CHNG"]]

        ws.range(f"A{row}").value = [["MOST ACTIVE CALLS"]]
        row += 1
        ws.range(f"A{row}").value = section_header
        row += 1
        if calls:
            ws.range(f"A{row}").value = most_active_rows(calls)
        row += len(calls) + 2

        ws.range(f"A{row}").value = [["MOST ACTIVE PUTS"]]
        row += 1
        ws.range(f"A{row}").value = section_header
        row += 1
        if puts:
            ws.range(f"A{row}").value = most_active_rows(puts)
        row += len(puts) + 2

        ws.range(f"A{row}").value = [["MOST ACTIVE CONTRACTS BY OI"]]
        row += 1
        ws.range(f"A{row}").value = section_header
        row += 1
        if by_oi:
            ws.range(f"A{row}").value = most_active_rows(by_oi)
        row += len(by_oi) + 2

    print("[HEATMAP] Updated Successfully")

# ==========================================================
# OPTION CHAIN
# ==========================================================

def build_option_rows(oc_json, desired_iso):

    rows = []

    data = oc_json.get("records", {}).get("data", [])

    for item in data:

        strike = item.get("strikePrice", "")

        ce = item.get("CE", {})
        pe = item.get("PE", {})

        expiry = None

        if ce:
            expiry = normalize_for_compare(ce.get("expiryDate"))
        elif pe:
            expiry = normalize_for_compare(pe.get("expiryDate"))

        if desired_iso:
            if expiry != desired_iso:
                continue

        rows.append([
            ce.get("openInterest", 0),
            ce.get("changeinOpenInterest", 0),
            ce.get("totalTradedVolume", 0),
            ce.get("impliedVolatility", 0),
            ce.get("lastPrice", 0),
            ce.get("change", 0),
            strike,
            pe.get("change", 0),
            pe.get("lastPrice", 0),
            pe.get("impliedVolatility", 0),
            pe.get("totalTradedVolume", 0),
            pe.get("changeinOpenInterest", 0),
            pe.get("openInterest", 0)
        ])

    return rows

# ==========================================================
# FUTURE + VWAP
# ==========================================================

def get_future_and_vwap(symbol, session, future_index, underlying_name):

    state = STATE[symbol]

    if future_index is None:
        # No futures data source wired up for this symbol (e.g. Sensex/BSE).
        return None, None

    today = datetime.now().date()

    if state["last_reset_date"] != today:
        state["prev_volume"] = None
        state["vwap_pv_sum"] = 0
        state["vwap_vol_sum"] = 0
        state["last_reset_date"] = today

    future_json = fetch_future(session, future_index)

    data = future_json.get("data", [])

    selected = None

    for item in data:
        if item.get("underlying") != underlying_name:
            continue
        selected = item
        break

    if selected is None:
        for item in data:
            if item.get("underlying") == underlying_name:
                selected = item
                break

    if selected is None:
        return None, None

    price = selected.get("lastPrice")

    volume = (
        selected.get("volume")
        or selected.get("numberOfContractsTraded")
        or 0
    )

    high = selected.get("dayHigh", price)
    low = selected.get("dayLow", price)

    typical = (high + low + price) / 3

    if state["prev_volume"] is None:
        state["prev_volume"] = volume
        state["vwap_pv_sum"] = typical * volume
        state["vwap_vol_sum"] = volume
    else:
        delta = max(volume - state["prev_volume"], 1)
        state["vwap_pv_sum"] += typical * delta
        state["vwap_vol_sum"] += delta
        state["prev_volume"] = volume

    vwap = round(state["vwap_pv_sum"] / state["vwap_vol_sum"], 2)

    return price, vwap

# ==========================================================
# PER-SYMBOL PIPELINE
# ==========================================================

def process_symbol(session, cfg):

    symbol = cfg["symbol"]
    sheet = cfg["sheet"]

    if cfg["source"] == "bse":
        process_symbol_bse(cfg)
        return

    clear_analysis_if_new_day(symbol)

    option_expiry = read_cell(sheet, "S2")
    future_expiry = read_cell(sheet, "R2")  # kept for parity with original layout; not used for filtering futures here

    if hasattr(option_expiry, "strftime"):
        option_expiry = option_expiry.strftime("%d-%b-%Y")

    option_expiry = str(option_expiry).strip()

    print(f"[{symbol}] Option Expiry:", option_expiry)

    option_iso = normalize_for_compare(option_expiry)

    option_json = fetch_option_chain(session, cfg["nse_symbol"], option_expiry)

    spot = option_json.get("records", {}).get("underlyingValue", "")

    initialize_atm_strikes(symbol, spot, cfg["strike_step"])

    future, vwap = get_future_and_vwap(
        symbol,
        session,
        cfg["future_index"],
        underlying_name=cfg["nse_symbol"]
    )

    rows = build_option_rows(option_json, option_iso)

    # Dashboard export runs FIRST, before any Excel writes. It only needs
    # `rows` (already fetched from NSE) - it has no dependency on Excel at
    # all. Placing it here means a busy/blocked Excel (someone's clicked
    # into a cell, a dialog is open, etc.) can never prevent the dashboard
    # from refreshing, even if every write below it fails and raises.
    dash.update_index_dashboard(symbol, rows, spot, future, vwap, STATE[symbol]["atm_strikes"])

    write_market_data(sheet, spot, future, vwap)
    write_option_chain(sheet, rows)
    write_analysis(symbol, rows, spot, future, vwap)
    write_strike_coi_data(symbol, rows)
    write_strike_oi_data(symbol, rows)
    write_nifty_strategy_data(symbol, rows)

    print(f"[{symbol}] Spot={spot} Future={future} VWAP={vwap} Rows={len(rows)}")

def process_symbol_bse(cfg):

    symbol = cfg["symbol"]
    sheet = cfg["sheet"]

    clear_analysis_if_new_day(symbol)

    option_expiry = read_cell(sheet, "S2")
    future_expiry = read_cell(sheet, "R2")

    if hasattr(option_expiry, "strftime"):
        option_expiry = option_expiry.strftime("%d-%b-%Y")

    if hasattr(future_expiry, "strftime"):
        future_expiry = future_expiry.strftime("%d-%b-%Y")

    option_expiry = str(option_expiry).strip()
    future_expiry = str(future_expiry).strip()

    print(
        f"[{symbol}] Option Expiry:",
        option_expiry,
        "| Future Expiry:",
        future_expiry
    )

    session = bse_session()

    option_json = fetch_bse_option_chain(
        session,
        cfg["scrip_cd"],
        option_expiry
    )

    table = option_json.get("Table") or []

    if not table:
        print(
            f"[{symbol}] No data returned from BSE for expiry "
            f"{option_expiry}."
        )
        return

    # ============================================================
    # SENSEX SPOT
    # ============================================================

    spot = to_number_bse(
        table[0].get("UlaValue", "")
    )

    # ============================================================
    # SENSEX PREVIOUS CLOSE
    # ============================================================
    # IMPORTANT:
    # Do NOT depend on PreClose from the BSE derivatives
    # option-chain response.
    #
    # First try the BSE CASH SENSEX previous-close API.
    # If that fails, fall back to the previous-close value
    # maintained by dashboard_export, if available.
    # ============================================================

    previous_close = fetch_bse_sensex_previous_close(session)

    if (
        previous_close is not None
        and spot is not None
        and previous_close != 0
    ):

        calculated_change = round(
            spot - previous_close,
            2
        )

        calculated_pct = round(
            (calculated_change / previous_close) * 100,
            2
        )

        print(
            f"[SENSEX TRUE CHANGE] "
            f"Spot={spot:.2f} | "
            f"PreviousClose={previous_close:.2f} | "
            f"Change={calculated_change:.2f} | "
            f"PerChange={calculated_pct:.2f}% | "
            f"Source=BSE Cash SENSEX"
        )

    else:

        # --------------------------------------------------------
        # FALLBACK:
        # Try PreClose from the option-chain only if the cash
        # index API failed.
        # --------------------------------------------------------

        previous_close = None

        try:
            for item in table:

                if not isinstance(item, dict):
                    continue

                pc = item.get("PreClose")

                if pc not in (None, ""):

                    pc_value = to_number_bse(pc)

                    if (
                        pc_value not in (None, "")
                        and pc_value != 0
                    ):
                        previous_close = pc_value
                        break

        except Exception as e:

            print(
                f"[SENSEX] Option Chain PreClose Fallback Error : {e}"
            )

        if (
            previous_close is not None
            and spot is not None
            and previous_close != 0
        ):

            calculated_change = round(
                spot - previous_close,
                2
            )

            calculated_pct = round(
                (calculated_change / previous_close) * 100,
                2
            )

            print(
                f"[SENSEX TRUE CHANGE] "
                f"Spot={spot:.2f} | "
                f"PreviousClose={previous_close:.2f} | "
                f"Change={calculated_change:.2f} | "
                f"PerChange={calculated_pct:.2f}% | "
                f"Source=BSE Option Chain PreClose Fallback"
            )

        else:

            print(
                "[SENSEX TRUE CHANGE] "
                "PreviousClose unavailable from BSE Cash "
                "and Option Chain"
            )

    # ============================================================
    # ATM
    # ============================================================

    initialize_atm_strikes(
        symbol,
        spot,
        cfg["strike_step"]
    )

    # ============================================================
    # SENSEX FUTURE
    # ============================================================

    future, vwap = fetch_bse_future(
        session,
        future_expiry
    )

    # ============================================================
    # OPTION ROWS
    # ============================================================

    rows = build_option_rows_bse(
        option_json
    )

    # ============================================================
    # DASHBOARD EXPORT
    # ============================================================

    dash.update_index_dashboard(
        symbol,
        rows,
        spot,
        future,
        vwap,
        STATE[symbol]["atm_strikes"],
        previous_close
    )

    # ============================================================
    # EXISTING EXCEL WRITES — DO NOT CHANGE
    # ============================================================

    write_market_data(
        sheet,
        spot,
        future,
        vwap
    )

    write_option_chain(
        sheet,
        rows
    )

    write_analysis(
        symbol,
        rows,
        spot,
        future,
        vwap
    )

    write_strike_coi_data(
        symbol,
        rows
    )

    write_strike_oi_data(
        symbol,
        rows
    )

    print(
        f"[{symbol}] Spot={spot} "
        f"Future={future} "
        f"Rows={len(rows)}"
    )
# ==========================================================
# MARKET HOURS CHECK
# ==========================================================

def is_market_open(now):

    # Skip weekends entirely (Monday=0 ... Sunday=6)
    if now.weekday() >= 5:
        return False

    current_minutes = now.hour * 60 + now.minute

    market_start = 9 * 60 + 15      # 09:15 AM
    market_end = 15 * 60 + 30       # 03:30 PM

    return market_start <= current_minutes <= market_end

# ==========================================================
# MAIN
# ==========================================================

def main():

    print("MULTI-INDEX OPTION CHAIN + VIX EXCEL UPDATER STARTED")
    print("EXCEL_FILE =", EXCEL_FILE)

    if not os.path.exists(EXCEL_FILE):
        print(
            f"ERROR: EXCEL_FILE does not exist at this path: {EXCEL_FILE}\n"
            "This is almost certainly why every symbol failed with a COM "
            "error above - xlwings can't open a file that isn't there. "
            "Update EXCEL_FILE to the correct path (and confirm whether "
            "you want one shared workbook with Sheet1-Sheet4, or separate "
            "workbooks per index) before running again."
        )
        return

    # Prime the VIX NSE session once at startup
    refresh_vix_nse_session()

    # Prime the heatmap NSE session once at startup
    init_heatmap_session()

    # Restore NIFTY's fixed ATM strike from the strategy sheet if it was
    # already set earlier today (handles a mid-day script restart)
    recover_nifty_atm_if_same_day()

    while True:

        now = datetime.now()

        session = nse_session()

        for cfg in SYMBOL_CONFIGS:

            try:
                process_symbol(session, cfg)

            except Exception as e:
                print(f"[{cfg['symbol']}] ERROR:", e)
                traceback.print_exc()

        try:
            update_heatmap_sheet()
        except Exception as e:
            print("[HEATMAP] ERROR:", e)
            traceback.print_exc()

        try:
            update_vix_sheet(now)
        except Exception as e:
            print("[VIX] ERROR:", e)
            traceback.print_exc()

        try:
            get_wb().save()
            dash.export_dashboard_json(is_market_open(now))

        except Exception as e:
            print("Error Saving Workbook :", e)

        print("Sleeping 180 Seconds...\n")
        time.sleep(180)


if __name__ == "__main__":
    main()
