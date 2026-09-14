"""
fiidii_export.py
=================
Drop this file next to fii_master_claude.py (your Google-Sheets FII/DII
script). It writes fiidii_data.json into the SAME folder as
dashboard_data.json, so the dashboard's fetch('fiidii_data.json') picks it
up automatically.

Wire-up — 2 lines added to fii_master_claude.py's `if __name__ == "__main__":`
block, right after df_oi and df_fii are built (after the line
`df_fii = read_fiidii_archive(df_live)`):

    import fiidii_export
    fiidii_export.export_fiidii_json(df_fii, df_oi)

Note: unlike the option-chain script, fii_master_claude.py runs once and
exits (it's a batch/report script, not a 180s loop) — so fiidii_data.json
will hold whatever the last run produced until you run this script again.
NSE only publishes FII/DII figures once per day anyway, so that's normal;
this file doesn't need to be re-run every few minutes.
"""

import json
import os
from datetime import datetime

# Point this at the SAME folder the option-chain dashboard uses.
FIIDII_JSON_PATH = r"C:\Users\TDutta\derivasense\public\fiidii_data.json"


def _f(v, default=0.0):
    try:
        f = float(v)
        return default if f != f else f  # NaN guard (NaN != NaN is True)
    except (TypeError, ValueError):
        return default


def _date_str(v):
    if hasattr(v, "strftime"):
        return v.strftime("%d %b")
    return str(v)


def export_fiidii_json(df_fii, df_oi, path=FIIDII_JSON_PATH):
    """
    df_fii  -> output of read_fiidii_archive(df_live): Date, Buy/Sell/Net
               DII and FII columns, last 30 trading days, ascending.
    df_oi   -> output of read_oi_sheet("FIIOIDATA", client_filter="FII"):
               Date, Future Index Long %/Short %, last 30 trading days.
    """
    payload = {
        "asOf": datetime.now().strftime("%d %b %Y, %H:%M:%S IST"),
        "fiidii": None,
        "fiiPctTrend": [],
        "flowTrend": [],
    }

    if df_fii is not None and not df_fii.empty:
        last = df_fii.iloc[-1]
        payload["fiidii"] = {
            "date": last["Date"].strftime("%d %b %Y") if hasattr(last["Date"], "strftime") else str(last["Date"]),
            "buyFII": _f(last.get("Buy FII/FPI *")),
            "sellFII": _f(last.get("Sell FII/FPI *")),
            "netFII": _f(last.get("Net FII/FPI *")),
            "buyDII": _f(last.get("Buy DII **")),
            "sellDII": _f(last.get("Sell DII **")),
            "netDII": _f(last.get("Net DII **")),
        }

        tail = df_fii.tail(10)
        payload["flowTrend"] = [
            [_date_str(row["Date"]), _f(row.get("Net FII/FPI *")), _f(row.get("Net DII **"))]
            for _, row in tail.iterrows()
        ]

    if df_oi is not None and not df_oi.empty:
        tail = df_oi.tail(15)
        payload["fiiPctTrend"] = [
            [_date_str(row["Date"]), _f(row.get("Future Index Long %")), _f(row.get("Future Index Short %"))]
            for _, row in tail.iterrows()
        ]

    tmp_path = path + ".tmp"
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
        print(f"[FII/DII DASHBOARD] Exported -> {path}")
    except Exception as e:
        print(f"[FII/DII DASHBOARD] Export failed: {e}")
