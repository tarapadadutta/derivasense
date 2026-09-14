"""
dashboard_export.py
====================

Dashboard JSON exporter for DerivaSense.

IMPORTANT:
- Existing dashboard functions/data structures are preserved.
- NIFTY / BANKNIFTY / FINNIFTY use NSE true change where available.
- SENSEX uses BSE previous-close information when supplied.
- Falls back safely when previous-close information is unavailable.
- No existing option-chain, OI, COI, PCR, trend, heatmap, or market-data
  calculations are intentionally changed.

Compatible with:
    dash.update_index_dashboard(...)
    dash.update_market_stats_dashboard(
        ...,
        most_active_value=...,
        most_active_volume=...
    )
"""

import json
import os
from datetime import datetime


# ============================================================
# DASHBOARD JSON LOCATION
# ============================================================

DASHBOARD_JSON_PATH = r"C:\Users\TDutta\derivasense\public\dashboard_data.json"


# ============================================================
# MAIN DASHBOARD DATA
# ============================================================

DASHBOARD = {
    "asOf": None,
    "marketOpen": False,

    "indices": {},

    "vix": {
        "value": None,
        "chg": 0,
        "chgPct": 0
    },

    "vixTrend": [],

    "sectors": [],
    "gainers": [],
    "losers": [],

    "strikeOI": {},
    "strikeCOI": {},

    "bigPlayer": {},

    "coiTrend": {},
    "straddleTrend": {},
    "pcrTrend": {},
    "priceTrend": {},

    "marketStats": {
        "advances": None,
        "declines": None,
        "unchanged": None
    },

    "mostActive": {
        "calls": [],
        "puts": [],
        "byOI": []
    },

    "mostActiveStocks": {
        "value": [],
        "volume": []
    },

    "optionChain": {}
}


# ============================================================
# INTERNAL STATE
# ============================================================

_prev_vix = {
    "value": None
}

_vix_trend_day = {
    "date": None
}

_coi_trend_day = {
    "date": None
}

MAX_COI_TREND_POINTS = 150


# ============================================================
# SAFE NUMBER CONVERSION
# ============================================================

def _num(v, default=0):
    try:
        if v is None:
            return default

        if isinstance(v, str):
            s = v.strip()

            if not s:
                return default

            # Remove commas commonly present in BSE/NSE responses
            s = s.replace(",", "")

            return float(s)

        return float(v)

    except (TypeError, ValueError):
        return default


# ============================================================
# TRUE CHANGE MAP - NSE
# ============================================================

TRUE_CHANGE_MAP = {
    "NIFTY": "NIFTY 50",
    "BANKNIFTY": "NIFTY BANK",
    "FINNIFTY": "NIFTY FINANCIAL SERVICES",
}


_true_change = {}


# ============================================================
# SENSEX PREVIOUS CLOSE STATE
# ============================================================

# Stores BSE previous close for SENSEX.
#
# This is deliberately separate from _true_change because SENSEX
# comes from BSE and is not present in NSE allIndices.
#
# Example:
#     {
#         "SENSEX": 76944.28
#     }
#
_sensex_previous_close = {
    "SENSEX": None
}


# ============================================================
# UPDATE NSE TRUE CHANGES
# ============================================================

def update_true_changes(index_snapshot):
    """
    Call once per cycle after fetch_vix_and_nifty().

    Expected format:

        {
            "NIFTY 50": {
                "last": ...,
                "change": ...,
                "pChange": ...
            },
            "NIFTY BANK": {...},
            "NIFTY FINANCIAL SERVICES": {...},
            "INDIA VIX": {...}
        }

    Stores NSE's actual change versus previous close.
    """

    for name, info in (index_snapshot or {}).items():

        try:
            chg = _num(
                info.get("change"),
                None
            )

            chg_pct = _num(
                info.get("pChange"),
                None
            )

            if chg is not None and chg_pct is not None:

                _true_change[name] = {
                    "chg": round(chg, 2),
                    "chgPct": round(chg_pct, 2)
                }

        except Exception:
            continue


# ============================================================
# UPDATE SENSEX PREVIOUS CLOSE
# ============================================================

def update_sensex_previous_close(previous_close):
    """
    Store the BSE SENSEX previous closing value.

    This function is optional.

    It can be called from python_optionchain_website_mod1.py whenever
    the BSE response contains:

        "PreClose": "76944.28"

    Example:

        dash.update_sensex_previous_close(
            table[0].get("PreClose")
        )

    The value is used by update_index_dashboard() for SENSEX.
    """

    value = _num(previous_close, None)

    if value is not None and value != 0:

        _sensex_previous_close["SENSEX"] = value

        print(
            f"[SENSEX TRUE CHANGE] Previous Close = "
            f"{value:.2f}"
        )


# ============================================================
# UPDATE INDEX DASHBOARD
# ============================================================

def update_index_dashboard(
    symbol,
    rows,
    spot,
    future,
    vwap,
    atm_strikes,
    previous_close=None
):
    """
    Update dashboard data for NIFTY / BANKNIFTY / FINNIFTY / SENSEX.

    Existing calls remain compatible:

        dash.update_index_dashboard(
            symbol,
            rows,
            spot,
            future,
            vwap,
            STATE[symbol]["atm_strikes"]
        )

    Optional SENSEX previous close:

        dash.update_index_dashboard(
            symbol,
            rows,
            spot,
            future,
            vwap,
            STATE[symbol]["atm_strikes"],
            previous_close
        )

    If previous_close is supplied for SENSEX, it is used to calculate
    the actual percentage change from BSE previous close.
    """

    if not rows:
        return

    # --------------------------------------------------------
    # IMPORTANT FIX
    #
    # Always initialize previous_close BEFORE using it.
    # This prevents:
    #
    # UnboundLocalError:
    # cannot access local variable 'previous_close'
    # --------------------------------------------------------

    if previous_close is None:

        if symbol == "SENSEX":

            previous_close = _sensex_previous_close.get(
                "SENSEX"
            )

        else:

            previous_close = None

    else:

        previous_close = _num(
            previous_close,
            None
        )

        if (
            symbol == "SENSEX"
            and previous_close is not None
            and previous_close != 0
        ):
            _sensex_previous_close["SENSEX"] = previous_close

    # ========================================================
    # COMPLETE OPTION CHAIN
    # ========================================================

    try:

        DASHBOARD["optionChain"][symbol] = [

            [
                _num(r[0]),
                _num(r[1]),
                _num(r[2]),
                _num(r[3]),
                _num(r[4]),
                _num(r[5]),
                _num(r[6]),
                _num(r[7]),
                _num(r[8]),
                _num(r[9]),
                _num(r[10]),
                _num(r[11]),
                _num(r[12])
            ]

            for r in rows

            if len(r) >= 13

        ]

    except Exception:

        DASHBOARD["optionChain"][symbol] = []

    # ========================================================
    # OI / COI SUMS
    # ========================================================

    call_oi_sum = sum(
        _num(r[0])
        for r in rows
    )

    put_oi_sum = sum(
        _num(r[12])
        for r in rows
    )

    call_coi_sum = sum(
        _num(r[1])
        for r in rows
    )

    put_coi_sum = sum(
        _num(r[11])
        for r in rows
    )

    change_coi_sum = (
        put_coi_sum -
        call_coi_sum
    )

    # ========================================================
    # PCR
    # ========================================================

    pcr_oi = (
        round(
            put_oi_sum /
            call_oi_sum,
            4
        )
        if call_oi_sum
        else None
    )

    pcr_coi = (
        round(
            put_coi_sum /
            call_coi_sum,
            4
        )
        if call_coi_sum
        else None
    )

    # ========================================================
    # WHOLE-CHAIN SUPPORT / RESISTANCE
    # ========================================================

    resistance = (
        max(
            rows,
            key=lambda r: _num(r[0])
        )[6]
        if rows
        else None
    )

    support = (
        max(
            rows,
            key=lambda r: _num(r[12])
        )[6]
        if rows
        else None
    )

    # ========================================================
    # NEAR ATM SUPPORT / RESISTANCE
    # ========================================================

    resistance_near = None
    support_near = None

    if atm_strikes and len(atm_strikes) >= 11:

        near_set = set(
            atm_strikes[2:-2]
        )

        near_rows = [
            r
            for r in rows
            if r[6] in near_set
        ]

        if near_rows:

            resistance_near = max(
                near_rows,
                key=lambda r: _num(r[0])
            )[6]

            support_near = max(
                near_rows,
                key=lambda r: _num(r[12])
            )[6]

    # ========================================================
    # ATM
    # ========================================================

    atm = (
        atm_strikes[
            len(atm_strikes) // 2
        ]
        if atm_strikes
        else None
    )

    # ========================================================
    # BIG PLAYER / RETAILER
    # ========================================================

    big_player = None

    if atm_strikes:

        step = (
            atm_strikes[1] -
            atm_strikes[0]
            if len(atm_strikes) > 1
            else 50
        )

        live_atm = int(
            round(
                _num(spot) /
                step
            ) *
            step
        )

        window = set(
            range(
                live_atm - step * 10,
                live_atm + step * 10 + 1,
                step
            )
        )

        window_rows = [
            r
            for r in rows
            if r[6] in window
        ]

        if window_rows:

            bp_call_row = max(
                window_rows,
                key=lambda r: _num(r[2])
            )

            bp_put_row = max(
                window_rows,
                key=lambda r: _num(r[10])
            )

            call_oi_lakh = round(
                _num(bp_call_row[0]) /
                1e5,
                5
            )

            put_oi_lakh = round(
                _num(bp_put_row[12]) /
                1e5,
                5
            )

            call_vol = _num(
                bp_call_row[2]
            )

            call_coi = _num(
                bp_call_row[1]
            )

            put_vol = _num(
                bp_put_row[10]
            )

            put_coi = _num(
                bp_put_row[11]
            )

            call_ratio = (
                round(
                    call_coi /
                    call_vol,
                    8
                )
                if call_vol
                else None
            )

            put_ratio = (
                round(
                    put_coi /
                    put_vol,
                    8
                )
                if put_vol
                else None
            )

            side = None

            if (
                call_ratio is not None
                and put_ratio is not None
            ):

                if call_ratio > put_ratio:

                    side = "CALL"

                elif put_ratio > call_ratio:

                    side = "PUT"

            big_player = {

                "resistanceStrike":
                    bp_call_row[6],

                "supportStrike":
                    bp_put_row[6],

                "callOiLakh":
                    call_oi_lakh,

                "putOiLakh":
                    put_oi_lakh,

                "callRatio":
                    call_ratio,

                "putRatio":
                    put_ratio,

                "bigPlayerSide":
                    side
            }

    DASHBOARD["bigPlayer"][symbol] = (
        big_player
    )

    # ========================================================
    # TRUE CHANGE / PERCENTAGE CHANGE
    # ========================================================

    #
    # SENSEX
    # --------------------------------------------------------
    # BSE SENSEX is NOT in NSE allIndices.
    #
    # Therefore:
    #
    #     Change = Current Spot - BSE Previous Close
    #
    #     Change % =
    #       Change / BSE Previous Close * 100
    #
    # Example:
    #
    # Previous close = 76944.28
    # Current spot   = 76570.35
    #
    # Change = -373.93
    #
    # Change % ≈ -0.49%
    #

    if symbol == "SENSEX":

        pc = _num(
            previous_close,
            None
        )

        current_spot = _num(
            spot,
            None
        )

        if (
            pc is not None
            and pc != 0
            and current_spot is not None
        ):

            chg = round(
                current_spot - pc,
                2
            )

            chg_pct = round(
                (
                    chg /
                    pc
                ) * 100,
                2
            )

            # Keep the value for subsequent cycles.
            _sensex_previous_close[
                "SENSEX"
            ] = pc

            print(
                f"[SENSEX TRUE CHANGE] "
                f"Spot={current_spot:.2f} "
                f"PreviousClose={pc:.2f} "
                f"Change={chg:.2f} "
                f"Change%={chg_pct:.2f}%"
            )

        else:

            # Safe fallback only if BSE previous-close
            # data has not yet been supplied.
            prev_spot = (
                DASHBOARD["indices"]
                .get(symbol, {})
                .get("spot")
            )

            if (
                prev_spot is not None
                and _num(prev_spot, 0) != 0
                and current_spot is not None
            ):

                chg = round(
                    current_spot -
                    _num(prev_spot),
                    2
                )

                chg_pct = round(
                    (
                        chg /
                        _num(prev_spot)
                    ) * 100,
                    2
                )

            else:

                chg = 0
                chg_pct = 0

    else:

        # ----------------------------------------------------
        # NSE indices
        # ----------------------------------------------------

        true_ref = TRUE_CHANGE_MAP.get(
            symbol
        )

        true = (
            _true_change.get(
                true_ref
            )
            if true_ref
            else None
        )

        if true is not None:

            chg = true["chg"]
            chg_pct = true["chgPct"]

        else:

            prev_spot = (
                DASHBOARD["indices"]
                .get(symbol, {})
                .get("spot")
            )

            current_spot = _num(
                spot,
                None
            )

            if (
                prev_spot is not None
                and _num(prev_spot, 0) != 0
                and current_spot is not None
            ):

                chg = round(
                    current_spot -
                    _num(prev_spot),
                    2
                )

                chg_pct = round(
                    (
                        chg /
                        _num(prev_spot)
                    ) * 100,
                    2
                )

            else:

                chg = 0
                chg_pct = 0

    # ========================================================
    # INDEX SNAPSHOT
    # ========================================================

    DASHBOARD["indices"][symbol] = {

        "symbol":
            symbol,

        "spot":
            _num(
                spot,
                None
            ),

        "future":
            (
                _num(future, None)
                if future not in (
                    None,
                    ""
                )
                else None
            ),

        "vwap":
            (
                _num(vwap, None)
                if vwap not in (
                    None,
                    ""
                )
                else None
            ),

        "chg":
            chg,

        "chgPct":
            chg_pct,

        "atm":
            atm,

        "support":
            support,

        "resistance":
            resistance,

        "supportNear":
            support_near,

        "resistanceNear":
            resistance_near,

        "pcrOI":
            pcr_oi,

        "pcrCOI":
            pcr_coi
    }

    # ========================================================
    # STRIKE OI / COI LADDER
    # ========================================================

    if atm_strikes:

        strike_map = {
            r[6]: r
            for r in rows
        }

        # ----------------------------------------------------
        # RAW OI
        # ----------------------------------------------------

        oi_ladder = []

        for s in atm_strikes:

            r = strike_map.get(s)

            call_oi = (
                _num(r[0])
                if r
                else 0
            )

            put_oi = (
                _num(r[12])
                if r
                else 0
            )

            oi_ladder.append(
                [
                    s,
                    call_oi,
                    put_oi
                ]
            )

        DASHBOARD["strikeOI"][symbol] = (
            oi_ladder
        )

        # ----------------------------------------------------
        # SIGNED COI
        # ----------------------------------------------------

        coi_ladder = []

        for s in atm_strikes:

            r = strike_map.get(s)

            call_coi = (
                _num(r[1])
                if r
                else 0
            )

            put_coi = (
                _num(r[11])
                if r
                else 0
            )

            coi_ladder.append(
                [
                    s,
                    call_coi,
                    put_coi
                ]
            )

        DASHBOARD["strikeCOI"][symbol] = (
            coi_ladder
        )

        # ----------------------------------------------------
        # ATM STRADDLE
        # ----------------------------------------------------

        atm_row = strike_map.get(
            atm
        )

        if atm_row:

            straddle_price = round(
                _num(atm_row[4]) +
                _num(atm_row[8]),
                2
            )

        else:

            straddle_price = None

    else:

        straddle_price = None

    # ========================================================
    # RESET DAILY TRENDS
    # ========================================================

    today = datetime.now().date()

    if (
        _coi_trend_day["date"]
        != today
    ):

        DASHBOARD["coiTrend"] = {}
        DASHBOARD["straddleTrend"] = {}
        DASHBOARD["pcrTrend"] = {}
        DASHBOARD["priceTrend"] = {}

        _coi_trend_day["date"] = today

    now_time = datetime.now().strftime(
        "%H:%M"
    )

    # ========================================================
    # COI TREND
    # ========================================================

    trend = DASHBOARD[
        "coiTrend"
    ].setdefault(
        symbol,
        []
    )

    trend.append(
        [
            now_time,
            round(
                change_coi_sum,
                2
            )
        ]
    )

    if len(trend) > MAX_COI_TREND_POINTS:

        del trend[0]

    # ========================================================
    # STRADDLE TREND
    # ========================================================

    if straddle_price is not None:

        s_trend = DASHBOARD[
            "straddleTrend"
        ].setdefault(
            symbol,
            []
        )

        s_trend.append(
            [
                now_time,
                straddle_price
            ]
        )

        if len(s_trend) > MAX_COI_TREND_POINTS:

            del s_trend[0]

    # ========================================================
    # PCR TREND
    # ========================================================

    pcr_trend = DASHBOARD[
        "pcrTrend"
    ].setdefault(
        symbol,
        []
    )

    pcr_trend.append(
        [
            now_time,
            (
                pcr_oi
                if pcr_oi is not None
                else 0
            ),
            (
                pcr_coi
                if pcr_coi is not None
                else 0
            )
        ]
    )

    if len(pcr_trend) > MAX_COI_TREND_POINTS:

        del pcr_trend[0]

    # ========================================================
    # PRICE TREND
    # ========================================================

    price_trend = DASHBOARD[
        "priceTrend"
    ].setdefault(
        symbol,
        []
    )

    price_trend.append(
        [
            now_time,

            _num(
                spot,
                None
            ),

            (
                _num(
                    future,
                    None
                )
                if future not in (
                    None,
                    ""
                )
                else None
            ),

            (
                _num(
                    vwap,
                    None
                )
                if vwap not in (
                    None,
                    ""
                )
                else None
            )
        ]
    )

    if len(price_trend) > MAX_COI_TREND_POINTS:

        del price_trend[0]


# ============================================================
# MARKET STATS / MOST ACTIVE
# ============================================================

def update_market_stats_dashboard(
    stats,
    calls_rows,
    puts_rows,
    by_oi_rows,
    most_active_value=None,
    most_active_volume=None
):
    """
    Updates:

        Advances
        Declines
        Unchanged

        Most Active Calls
        Most Active Puts
        Most Active by OI

        Most Active Stocks by Value
        Most Active Stocks by Volume

    IMPORTANT:
    most_active_value and most_active_volume are accepted as keyword
    arguments because python_optionchain_website_mod1.py passes them.
    """

    # ========================================================
    # MARKET STATISTICS
    # ========================================================

    try:

        cap = (
            stats or {}
        ).get(
            "snapshotCapitalMarket",
            {}
        )

        DASHBOARD["marketStats"] = {

            "advances":
                _num(
                    cap.get(
                        "advances"
                    ),
                    None
                ),

            "declines":
                _num(
                    cap.get(
                        "declines"
                    ),
                    None
                ),

            "unchanged":
                _num(
                    cap.get(
                        "unchange"
                    ),
                    None
                )
        }

    except Exception:

        pass

    # ========================================================
    # ROW CONVERTER
    # ========================================================

    def _rows(rows):

        out = []

        for r in (
            rows or []
        ):

            try:

                if isinstance(
                    r,
                    dict
                ):

                    r = list(
                        r.values()
                    )

                out.append(
                    [
                        str(r[0]),
                        _num(r[1]),
                        _num(r[2]),
                        _num(r[3])
                    ]
                )

            except Exception:

                continue

        return out

    # ========================================================
    # MOST ACTIVE CONTRACTS
    # ========================================================

    DASHBOARD["mostActive"] = {

        "calls":
            _rows(
                calls_rows
            ),

        "puts":
            _rows(
                puts_rows
            ),

        "byOI":
            _rows(
                by_oi_rows
            )
    }

    # ========================================================
    # MOST ACTIVE STOCKS
    # ========================================================

    DASHBOARD["mostActiveStocks"] = {

        "value":
            _rows(
                most_active_value
            ),

        "volume":
            _rows(
                most_active_volume
            )
    }


# ============================================================
# VIX DASHBOARD
# ============================================================

def update_vix_dashboard(
    vix_value,
    nifty_spot,
    index_snapshot=None
):
    """
    Update INDIA VIX and VIX intraday trend.

    Uses NSE's actual VIX change when available.
    """

    if vix_value is None:

        return

    # ========================================================
    # TRUE VIX CHANGE
    # ========================================================

    vix_snap = (
        index_snapshot or {}
    ).get(
        "INDIA VIX"
    )

    true_chg = (
        _num(
            vix_snap.get(
                "change"
            ),
            None
        )
        if vix_snap
        else None
    )

    true_chg_pct = (
        _num(
            vix_snap.get(
                "pChange"
            ),
            None
        )
        if vix_snap
        else None
    )

    if (
        true_chg is not None
        and true_chg_pct is not None
    ):

        chg = round(
            true_chg,
            2
        )

        chg_pct = round(
            true_chg_pct,
            2
        )

    else:

        prev = _prev_vix[
            "value"
        ]

        chg = (
            round(
                vix_value -
                prev,
                2
            )
            if prev is not None
            else 0
        )

        chg_pct = (
            round(
                (
                    chg /
                    prev
                ) * 100,
                2
            )
            if prev
            else 0
        )

    DASHBOARD["vix"] = {

        "value":
            round(
                vix_value,
                2
            ),

        "chg":
            chg,

        "chgPct":
            chg_pct
    }

    _prev_vix[
        "value"
    ] = vix_value

    # ========================================================
    # VIX TREND RESET
    # ========================================================

    today = datetime.now().date()

    if (
        _vix_trend_day["date"]
        != today
    ):

        DASHBOARD["vixTrend"] = []

        _vix_trend_day[
            "date"
        ] = today

    # ========================================================
    # VIX TREND
    # ========================================================

    DASHBOARD[
        "vixTrend"
    ].append(
        [
            datetime.now().strftime(
                "%H:%M"
            ),
            round(
                vix_value,
                2
            )
        ]
    )

    if len(
        DASHBOARD["vixTrend"]
    ) > MAX_COI_TREND_POINTS:

        del DASHBOARD[
            "vixTrend"
        ][0]


# ============================================================
# HEATMAP DASHBOARD
# ============================================================

def update_heatmap_dashboard(
    sector_data,
    gainers_data,
    losers_data
):
    """
    Update:

        Sector heatmap
        Top gainers
        Top losers
    """

    DASHBOARD["sectors"] = [

        {
            "name":
                s["index"],

            "chg":
                round(
                    _num(
                        s.get(
                            "pChange"
                        )
                    ),
                    2
                )
        }

        for s in (
            sector_data or []
        )
    ]

    DASHBOARD["gainers"] = [

        {
            "symbol":
                x["symbol"],

            "price":
                _num(
                    x.get(
                        "lastPrice"
                    )
                ),

            "chg":
                round(
                    _num(
                        x.get(
                            "pchange"
                        )
                    ),
                    2
                )
        }

        for x in (
            gainers_data or []
        )[:6]
    ]

    DASHBOARD["losers"] = [

        {
            "symbol":
                x["symbol"],

            "price":
                _num(
                    x.get(
                        "lastPrice"
                    )
                ),

            "chg":
                round(
                    _num(
                        x.get(
                            "pchange"
                        )
                    ),
                    2
                )
        }

        for x in (
            losers_data or []
        )[:6]
    ]


# ============================================================
# EXPORT JSON
# ============================================================

def export_dashboard_json(
    is_market_open
):
    """
    Atomically write dashboard_data.json.
    """

    DASHBOARD["asOf"] = (
        datetime.now().strftime(
            "%d %b %Y, %H:%M:%S IST"
        )
    )

    DASHBOARD["marketOpen"] = bool(
        is_market_open
    )

    tmp_path = (
        DASHBOARD_JSON_PATH +
        ".tmp"
    )

    try:

        os.makedirs(
            os.path.dirname(
                DASHBOARD_JSON_PATH
            ),
            exist_ok=True
        )

        with open(
            tmp_path,
            "w",
            encoding="utf-8"
        ) as f:

            json.dump(
                DASHBOARD,
                f,
                ensure_ascii=False,
                indent=2
            )

        os.replace(
            tmp_path,
            DASHBOARD_JSON_PATH
        )

        print(
            f"[DASHBOARD] Exported -> "
            f"{DASHBOARD_JSON_PATH}"
        )

    except Exception as e:

        print(
            f"[DASHBOARD] Export failed: {e}"
        )