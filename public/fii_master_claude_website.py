"""
FII Master Script  v7
=====================
ROOT CAUSE FOUND IN v6 (from real sheet data the user pasted):
  NSE's OI/Volume CSV wraps numeric fields in quotes BECAUSE the numbers
  contain comma thousand-separators, e.g. a real data line looks like:

      Client,"222,279.00","80,575.00","2,941,026.00",...

  Our old parser did `line.split(",")` — a NAIVE split that has no idea
  about quotes. It shredded "222,279.00" into TWO separate fields, which
  shifted every single column after it. By the time we reached
  "Future Index Long %" etc., we were reading completely misaligned,
  garbage/empty cells — which is exactly why the chart showed blanks for
  Future Index/Stock Long & Short.

  SECOND BUG found in the same data: the very first line of NSE's CSV
  header is sometimes duplicated into the data because of how we sliced
  lines[1:] across already-written historical content, producing a
  literal header-as-data row (the "5052026 | Client Type | Future Index
  Long | ..." row visible in the sheet).

FIX (v7):
  1. Use Python's built-in `csv` module to parse each line — it correctly
     respects quoted fields and embedded commas, so "222,279.00" stays
     as ONE field. We then strip commas only AFTER the field is correctly
     isolated, before casting to float.
  2. Skip any row whose 2nd field (Client Type) is literally "Client Type"
     (i.e. a header row that snuck into the data) — this guards against
     re-introducing duplicate header rows even if NSE's CSV format changes.
  3. Numeric parsing now strips thousand-separator commas explicitly with
     `value.replace(",", "")` before float() conversion, both when writing
     calculated columns AND when reading back from the sheet for charts.
"""

import os, ssl, sys, time, csv, io, certifi, gspread, requests, urllib3
import pandas as pd
from datetime import datetime, timedelta
from oauth2client.service_account import ServiceAccountCredentials
from gspread_formatting import cellFormat, NumberFormat, format_cell_range

# ══════════════════════════════════════════════════════════════
# 0.  GLOBAL SETUP
# ══════════════════════════════════════════════════════════════

sys.stdout.reconfigure(encoding="utf-8")
os.environ["SSL_CERT_FILE"] = certifi.where()
ssl._create_default_https_context = ssl.create_default_context(cafile=certifi.where())
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

CREDS_PATH  = "C:/Users/TDutta/optionchain_python/FIIDATA/fifth-boulder-433716-a3-b5d17b4bcefd.json"
GSHEET_NAME = "FII DATA"
SCOPE       = ["https://spreadsheets.google.com/feeds",
               "https://www.googleapis.com/auth/drive"]

URL_OI  = "https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{d}.csv"
URL_VOL = "https://nsearchives.nseindia.com/content/nsccl/fao_participant_vol_{d}.csv"

NSE_FIIDII_URLS = [
    "https://www.nseindia.com/api/fiidiiTradeReact",
]

USER_AGENTS = [
    ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
     "AppleWebKit/537.36 (KHTML, like Gecko) "
     "Chrome/124.0.0.0 Safari/537.36"),
    ("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) "
     "Gecko/20100101 Firefox/125.0"),
    ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) "
     "AppleWebKit/605.1.15 (KHTML, like Gecko) "
     "Version/17.4.1 Safari/605.1.15"),
]

# Detect whether the `brotli` decoder is available
try:
    import brotli  # noqa: F401
    _HAS_BROTLI = True
except ImportError:
    try:
        import brotlicffi  # noqa: F401
        _HAS_BROTLI = True
    except ImportError:
        _HAS_BROTLI = False

print(f"ℹ  Brotli decoder available: {_HAS_BROTLI}")
if not _HAS_BROTLI:
    print("   → Will request gzip/deflate only (skip 'br') so urllib3 can auto-decompress.")

OI_COL_DATE        = 0
OI_COL_CLIENT_TYPE = 1
OI_COL_FI_LONG     = 2
OI_COL_FI_SHORT    = 3
OI_COL_FS_LONG     = 4
OI_COL_FS_SHORT    = 5

OI_SHEET_HEADER = [
    "Date", "Client Type",
    "Future Index Long",       "Future Index Short",
    "Future Stock Long",       "Future Stock Short",
    "Option Index Call Long",  "Option Index Put Long",
    "Option Index Call Short", "Option Index Put Short",
    "Option Stock Call Long",  "Option Stock Put Long",
    "Option Stock Call Short", "Option Stock Put Short",
    "Total Long Contracts",    "Total Short Contracts",
    "Future Index Long %",     "Future Index Short %",
    "Future Stock Long %",     "Future Stock Short %",
    "FII Future Index (Long-Short) lakh",
]

FIIDII_HEADERS = [
    "Date",
    "Buy DII **",  "Buy FII/FPI *",
    "Sell DII **", "Sell FII/FPI *",
    "Net DII **",  "Net FII/FPI *",
    "NET FII_DII",
]

NUMBER_FMT = cellFormat(numberFormat=NumberFormat(type="NUMBER", pattern="#,##0.00"))

print("✅ SSL cert:", certifi.where())

# ══════════════════════════════════════════════════════════════
# 1.  GOOGLE SHEETS AUTH
# ══════════════════════════════════════════════════════════════

try:
    _creds  = ServiceAccountCredentials.from_json_keyfile_name(CREDS_PATH, SCOPE)
    gclient = gspread.authorize(_creds)
    print("✅ Google Sheets authenticated.")
except Exception as e:
    print(f"❌ Auth failed: {e}")
    sys.exit(1)


def get_worksheet(tab_name: str):
    try:
        ws = gclient.open(GSHEET_NAME).worksheet(tab_name)
        print(f"   ✅ Opened tab: '{tab_name}'")
        return ws
    except Exception as e:
        print(f"   ❌ Cannot open tab '{tab_name}': {e}")
        return None


# ══════════════════════════════════════════════════════════════
# 2.  TRADING-DAY UTILITIES
# ══════════════════════════════════════════════════════════════

def last_n_trading_days(n: int) -> list:
    days, dt = [], datetime.today() - timedelta(days=1)
    while len(days) < n:
        if dt.weekday() < 5:
            days.append(dt.strftime("%d%m%Y"))
        dt -= timedelta(days=1)
    return list(reversed(days))


# ══════════════════════════════════════════════════════════════
# 3.  NSE CSV FETCH
# ══════════════════════════════════════════════════════════════

def fetch_csv(session: requests.Session, url: str, date_str: str) -> str | None:
    headers = {
        "Accept": "text/csv,application/csv,*/*",
        "Referer": "https://www.nseindia.com/all-reports-derivatives",
    }
    try:
        r = session.get(url, headers=headers, verify=certifi.where(), timeout=15)
        if r.status_code == 200 and r.text.strip():
            print(f"      ✅ {date_str}")
            return r.text
        print(f"      ⚠ {date_str}: HTTP {r.status_code}, len={len(r.text)}")
        return None
    except Exception as e:
        print(f"      ❌ {date_str}: {e}")
        return None

# ══════════════════════════════════════════════════════════════
# 4.  PERCENTAGE + CALCULATED COLUMNS
# ══════════════════════════════════════════════════════════════

def _pct(n: float, d: float) -> str:
    return f"{n/d*100:.2f}%" if d else "N/A"


def _to_float(value: str) -> float:
    """
    NSE numbers arrive like '222,279.00' (thousand-separator commas).
    Strip commas BEFORE casting to float, or float() raises ValueError.
    """
    return float(str(value).replace(",", "").strip())


def add_calculated_cols(row: list) -> list:
    try:
        fi_l, fi_s = _to_float(row[OI_COL_FI_LONG]),  _to_float(row[OI_COL_FI_SHORT])
        fs_l, fs_s = _to_float(row[OI_COL_FS_LONG]),  _to_float(row[OI_COL_FS_SHORT])
        ls_lakh    = (fi_l - fi_s) / 1e5
        row.extend([
            _pct(fi_l, fi_l+fi_s), _pct(fi_s, fi_l+fi_s),
            _pct(fs_l, fs_l+fs_s), _pct(fs_s, fs_l+fs_s),
            f"{ls_lakh:.4f}",
        ])
    except (ValueError, IndexError):
        row.extend(["N/A"] * 5)
    return row


# ══════════════════════════════════════════════════════════════
# 5.  WRITE HELPERS
# ══════════════════════════════════════════════════════════════

def write_rows(ws, rows: list, batch: int = 20):
    for i in range(0, len(rows), batch):
        chunk = rows[i:i+batch]
        try:
            ws.append_rows(chunk, value_input_option="USER_ENTERED")
            print(f"      ✅ wrote {len(chunk)} rows")
        except Exception as e:
            print(f"      ❌ write error: {e}")


def _pad(row: list, n: int) -> list:
    if len(row) < n:
        row = row + [""] * (n - len(row))
    return row[:n]


def existing_dates_in_col(ws, col: int = 1) -> set:
    try:
        return set(ws.col_values(col))
    except Exception:
        return set()


def sheet_has_header(ws) -> bool:
    try:
        v = str(ws.cell(1, 1).value or "").strip()
        return not v.isdigit()
    except Exception:
        return False


def ensure_header(ws, headers: list):
    if not sheet_has_header(ws):
        ws.insert_row(headers, index=1)
        print("      ✅ Header row written.")


# ══════════════════════════════════════════════════════════════
# 6.  SYNC OI / VOLUME → SHEET
# ══════════════════════════════════════════════════════════════

def sync_nse_csv_to_sheet(tab_name: str, url_tpl: str, trading_days: list, session: requests.Session):

    print(f"\n── {tab_name} {'─'*(50-len(tab_name))}")

    ws = get_worksheet(tab_name)
    if ws is None:
        return

    ensure_header(ws, OI_SHEET_HEADER)

    # ---------------------------------------------------
    # Clear old data (keep header)
    # ---------------------------------------------------
    try:
        ws.batch_clear(["A2:U5000"])
        print("✅ Old data cleared.")
    except Exception as e:
        print("Clear Error:", e)

    new_rows = []

    # ---------------------------------------------------
    # Download all trading days
    # ---------------------------------------------------
    for date_str in trading_days:

        raw = fetch_csv(session, url_tpl.format(d=date_str), date_str)
        time.sleep(1.2)   # be gentle — avoid retriggering NSE's rate limiter

        if raw is None:
            continue

        reader = csv.reader(io.StringIO(raw))

        for i, cols in enumerate(reader):

            # Skip header
            if i == 0:
                continue

            cols = [c.strip() for c in cols]

            if len(cols) < 14:
                continue

            # Skip duplicate header rows
            if cols[0].lower() in ("client type", "date"):
                continue

            # Insert Date in first column
            cols.insert(0, date_str)

            # Add calculated columns
            cols = add_calculated_cols(cols)

            new_rows.append(cols)

    # ---------------------------------------------------
    # Write everything
    # ---------------------------------------------------
    if not new_rows:
        print("No rows downloaded.")
        return

    print(f"Writing {len(new_rows)} rows...")

    ws.update(
        values=new_rows,
        range_name=f"A2:U{len(new_rows)+1}"
    )

    try:
        format_cell_range(
            ws,
            f"C2:U{len(new_rows)+1}",
            NUMBER_FMT
        )
    except Exception as e:
        print(e)

    print(f"✅ {len(new_rows)} rows written.")
# ══════════════════════════════════════════════════════════════
# 7.  LIVE FII/DII FROM NSE API  (Brotli fix applied)
# ══════════════════════════════════════════════════════════════

def _accept_encoding() -> str:
    """
    THE FIX: only advertise encodings we can actually decode.
    urllib3 auto-decompresses gzip and deflate natively.
    It only decompresses brotli ('br') if the `brotli` package is installed.
    Since NSE happily serves br when we ask for it, and we were NOT decoding
    it, we simply stop asking for 'br' unless the decoder is present.
    """
    return "gzip, deflate, br" if _HAS_BROTLI else "gzip, deflate"


def _build_session(ua: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent":                ua,
        "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":           "en-US,en;q=0.9",
        "Accept-Encoding":           _accept_encoding(),   # <-- FIX applied here
        "Connection":                "keep-alive",
        "DNT":                       "1",
        "Upgrade-Insecure-Requests": "1",
    })
    return s


def _warm_up(session: requests.Session):
    pages = [
        ("https://www.nseindia.com/market-data/live-equity-market", 3),
        ("https://www.nseindia.com/",                                2),
    ]
    for url, wait in pages:
        try:
            r = session.get(url, timeout=15, verify=certifi.where())
            print(f"      warm-up {url.split('/')[-1] or 'home'}: "
                  f"HTTP {r.status_code}  cookies={list(session.cookies.keys())}")
            time.sleep(wait)
        except Exception as e:
            print(f"      warm-up error: {e}")


def fetch_live_fiidii(max_retries: int = 3) -> pd.DataFrame | None:
    for attempt in range(max_retries):
        ua      = USER_AGENTS[attempt % len(USER_AGENTS)]
        session = _build_session(ua)
        try:
            print(f"   ↳ Attempt {attempt+1}")
            _warm_up(session)

            session.headers.update({
                "Accept":           "application/json, text/plain, */*",
                "Accept-Encoding":  _accept_encoding(),     # re-affirm after warm-up
                "Referer":          "https://www.nseindia.com/market-data/live-equity-market",
                "X-Requested-With": "XMLHttpRequest",
            })

            for api_url in NSE_FIIDII_URLS:
                resp = session.get(api_url, timeout=15, verify=certifi.where())

                # ── DIAGNOSTIC: show what Content-Encoding NSE actually sent ──
                enc = resp.headers.get("Content-Encoding", "none")
                print(f"      [{api_url.split('/')[-1]}] HTTP {resp.status_code}  "
                      f"Content-Encoding={enc}  decoded_len={len(resp.content)}")

                if resp.status_code != 200:
                    print("      ⚠ Non-200 — skipping")
                    continue

                # requests auto-decompresses gzip/deflate transparently;
                # resp.text / resp.content are already decoded at this point
                # PROVIDED the server didn't send brotli when we can't read it.
                text = resp.text.strip()
                preview = text[:150].replace("\n", " ")
                print(f"      body preview: {repr(preview)}")

                if not text or text.startswith("<"):
                    print("      ⚠ Empty or HTML response — skipping")
                    continue

                try:
                    json_data = resp.json()
                except Exception as je:
                    print(f"      ⚠ JSON parse error: {je}")
                    continue

                if not json_data or not isinstance(json_data, list):
                    print("      ⚠ JSON empty or not a list")
                    continue

                print(f"      ✅ Got {len(json_data)} records")
                return _parse_fiidii_json(json_data)

        except Exception as e:
            print(f"   ⚠ Attempt {attempt+1} failed: {e}")
            time.sleep(5)

    print("   ❌ Live FII/DII unavailable — charts use existing sheet data.")
    return None


def _parse_fiidii_json(data: list) -> pd.DataFrame:
    df = pd.DataFrame(data)
    print(f"      JSON columns: {list(df.columns)}")

    col_map = {}
    for c in df.columns:
        lc = c.lower()
        if   "date"     in lc:                   col_map[c] = "date"
        elif "category" in lc or "type" in lc:   col_map[c] = "category"
        elif "buy"      in lc:                   col_map[c] = "buyValue"
        elif "sell"     in lc:                   col_map[c] = "sellValue"
        elif "net"      in lc:                   col_map[c] = "netValue"
    df = df.rename(columns=col_map)

    need    = {"date","category","buyValue","sellValue","netValue"}
    missing = need - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns after rename: {missing}  got={list(df.columns)}")

    df = df[["date","category","buyValue","sellValue","netValue"]].copy()
    df.columns = ["Date","Category","Buy","Sell","Net"]

    # ── FIX: NSE's JSON returns buyValue/sellValue/netValue as TEXT, not
    # numbers. Without this, "Buy"/"Sell"/"Net" stay strings all the way
    # through the pivot, and `piv["Net FII/FPI *"] + piv["Net DII **"]`
    # below does STRING CONCATENATION instead of addition — e.g.
    # "2603.72" + "2019.68" -> "2603.722019.68" instead of 4623.40.
    # Strip thousand-separator commas (NSE sometimes sends "17,171.75")
    # before casting, or float() would raise on the comma.
    for col in ("Buy", "Sell", "Net"):
        df[col] = pd.to_numeric(
            df[col].astype(str).str.replace(",", "", regex=False).str.strip(),
            errors="coerce"
        )

    # ── FIX: store Date in canonical ISO format to avoid parse warnings later ──
    df["Date"] = (pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
                    .dt.strftime("%Y-%m-%d"))
    df = df.dropna(subset=["Date"])

    piv = df.pivot(index="Date", columns="Category", values=["Buy","Sell","Net"])
    piv.columns = [f"{v} {k}" for v, k in piv.columns]
    piv = piv.reset_index().sort_values("Date", ascending=False)

    rmap = {}
    for c in piv.columns:
        lc = c.lower()
        if "buy"  in lc and "dii" in lc: rmap[c] = "Buy DII **"
        if "buy"  in lc and "fii" in lc: rmap[c] = "Buy FII/FPI *"
        if "sell" in lc and "dii" in lc: rmap[c] = "Sell DII **"
        if "sell" in lc and "fii" in lc: rmap[c] = "Sell FII/FPI *"
        if "net"  in lc and "dii" in lc: rmap[c] = "Net DII **"
        if "net"  in lc and "fii" in lc: rmap[c] = "Net FII/FPI *"
    piv = piv.rename(columns=rmap)

    try:
        piv["NET FII_DII"] = piv["Net FII/FPI *"] + piv["Net DII **"]
    except KeyError:
        piv["NET FII_DII"] = None

    cols = [c for c in FIIDII_HEADERS if c in piv.columns]
    return piv[cols]


def sync_fiidii_to_sheet(df: pd.DataFrame | None):
    print(f"\n── fiidii {'─'*49}")
    ws = get_worksheet("fiidii")
    if ws is None:
        return
    if df is None or df.empty:
        print("   ⚠ No live data — sheet unchanged.")
        return

    rows_list = [df.columns.tolist()] + df.fillna("").values.tolist()
    col_end   = chr(ord("A") + len(df.columns) - 1)

    ws.batch_clear([f"A1:{col_end}{len(rows_list)+2}"])
    ws.update(values=rows_list, range_name="A1")
    try:
        format_cell_range(ws, f"B2:{col_end}1000", NUMBER_FMT)
    except Exception:
        pass
    print(f"   ✅ Snapshot ({len(df)} rows) → A1:{col_end}.")

    # ── Archive at col J — always write Date as literal first header ──
    ARCH_COL  = 10    # J
    arch_vals = ws.col_values(ARCH_COL)

    # ── FIX: verify the existing archive header is actually "Date" ──
    needs_header = (not arch_vals) or (arch_vals[0].strip() != "Date")
    if needs_header:
        ws.update(values=[FIIDII_HEADERS],
                  range_name=gspread.utils.rowcol_to_a1(1, ARCH_COL))
        arch_vals = [FIIDII_HEADERS[0]]
        print("      ✅ Archive header (re)written with 'Date' as col J row 1.")

    arch_dates = set(arch_vals)
    next_row   = len(arch_vals) + 1

    new_rows = []
    for _, row in df.iterrows():
        d = str(row.get("Date", ""))
        if d in arch_dates:
            continue
        ordered = [str(row.get(h, "")) for h in FIIDII_HEADERS]
        new_rows.append(ordered)

    if new_rows:
        ws.update(values=new_rows,
                  range_name=gspread.utils.rowcol_to_a1(next_row, ARCH_COL))
        print(f"   ✅ Archive: {len(new_rows)} new row(s) appended (col J).")
    else:
        print("   ℹ  Archive: nothing new.")


# ══════════════════════════════════════════════════════════════
# 8.  READ BACK LAST 30 TRADING DAYS FOR PLOTTING
# ══════════════════════════════════════════════════════════════

def read_oi_sheet(tab_name: str, client_filter: str = "FII") -> pd.DataFrame:

    ws = get_worksheet(tab_name)
    if ws is None:
        return pd.DataFrame()

    try:

        rows = ws.get_all_values()

        if len(rows) < 2:
            print(f"⚠ '{tab_name}' is empty.")
            return pd.DataFrame()

        # ------------------------------------------
        # Detect header
        # ------------------------------------------
        first_cell = str(rows[0][0]).strip()

        if first_cell.isdigit():
            header = OI_SHEET_HEADER
            data_rows = rows
        else:
            header = rows[0]
            data_rows = rows[1:]

        data = [_pad(r, len(header)) for r in data_rows]

        df = pd.DataFrame(data, columns=header)

        # ------------------------------------------
        # Check required columns
        # ------------------------------------------
        required_cols = [
            "Date",
            "Client Type",
            "Future Index Long %",
            "Future Index Short %",
        ]

        for col in required_cols:
            if col not in df.columns:
                print(f"❌ Missing column : {col}")
                print(df.columns.tolist())
                return pd.DataFrame()

        # ------------------------------------------
        # Remove duplicate header row
        # ------------------------------------------
        df = df[
            df["Client Type"]
            .astype(str)
            .str.strip()
            .str.upper() != "CLIENT TYPE"
        ]

        # ------------------------------------------
        # Filter Client
        # ------------------------------------------
        df = df[
            df["Client Type"]
            .astype(str)
            .str.strip()
            .str.upper()
            .isin([client_filter.upper(), f"{client_filter}/FPI"])
        ].copy()

        if df.empty:
            print("No FII rows found.")
            return pd.DataFrame()

        # ------------------------------------------
        # Date
        # ------------------------------------------
        df["Date"] = pd.to_datetime(
            df["Date"],
            format="%d%m%Y",
            errors="coerce"
        )

        df = df.dropna(subset=["Date"])

        # ------------------------------------------
        # Remove %
        # ------------------------------------------
        pct_cols = [
            "Future Index Long %",
            "Future Index Short %",
            "Future Stock Long %",
            "Future Stock Short %",
        ]

        for col in pct_cols:

            if col in df.columns:

                df[col] = (
                    df[col]
                    .astype(str)
                    .str.replace("%", "", regex=False)
                    .str.replace(",", "", regex=False)
                    .str.strip()
                )

                df[col] = pd.to_numeric(df[col], errors="coerce")

                if df[col].max() <= 1:
                    df[col] = df[col] * 100

        # ------------------------------------------
        # Other numeric columns
        # ------------------------------------------
        numeric_cols = [

            "Future Index Long",
            "Future Index Short",
            "Future Stock Long",
            "Future Stock Short",
            "Total Long Contracts",
            "Total Short Contracts",
            "FII Future Index (Long-Short) lakh",

        ]

        for col in numeric_cols:

            if col in df.columns:

                df[col] = (
                    df[col]
                    .astype(str)
                    .str.replace(",", "", regex=False)
                    .str.strip()
                )

                df[col] = pd.to_numeric(
                    df[col],
                    errors="coerce"
                )

        # ------------------------------------------
        # Sort
        # ------------------------------------------
        df = df.sort_values("Date")

        # ------------------------------------------
        # Remove duplicate dates
        # ------------------------------------------
        df = df.drop_duplicates(subset=["Date"], keep="last")

        # ------------------------------------------
        # Last 30 days
        # ------------------------------------------
        df = df.tail(30).reset_index(drop=True)

        # ------------------------------------------
        # DEBUG
        # ------------------------------------------
        print("\n============================")
        print(tab_name)
        print("============================")

        print(df[[
            "Date",
            "Future Index Long %",
            "Future Index Short %"
        ]])

        print("============================\n")

        return df

    except Exception as e:

        print(e)

        import traceback

        traceback.print_exc()

        return pd.DataFrame()
def read_fiidii_archive(df_live: pd.DataFrame | None) -> pd.DataFrame:

    ws = get_worksheet("fiidii")
    arch_df = pd.DataFrame()

    if ws:
        try:

            all_vals = ws.get_all_values()

            if len(all_vals) > 1:

                ARCH_COL_IDX = 9      # Column J

                raw_hdr = (
                    all_vals[0][ARCH_COL_IDX:]
                    if len(all_vals[0]) > ARCH_COL_IDX
                    else []
                )

                arch_hdr = [h for h in raw_hdr if h.strip()]

                if not arch_hdr or arch_hdr[0] != "Date":

                    print("Archive header missing. Using default header.")

                    arch_hdr = FIIDII_HEADERS

                n = len(arch_hdr)

                arch_data = [

                    r[ARCH_COL_IDX:ARCH_COL_IDX+n]

                    for r in all_vals[1:]

                    if len(r) > ARCH_COL_IDX and r[ARCH_COL_IDX].strip()

                ]

                if arch_data:

                    clean = [_pad(r, n) for r in arch_data]

                    arch_df = pd.DataFrame(clean, columns=arch_hdr)

                    # ===========================================
                    # DEBUG
                    # ===========================================
                    print("\n===================================")
                    print("ARCHIVE COLUMN NAMES")
                    print("===================================")
                    print(arch_df.columns.tolist())

                    print("\nARCHIVE DATA")
                    print("===================================")
                    print(arch_df.head(10))
                    print("===================================\n")

                    if "Date" in arch_df.columns:

                        arch_df["Date"] = pd.to_datetime(

                            arch_df["Date"],
                            format="%Y-%m-%d",
                            errors="coerce"

                        )

                        if arch_df["Date"].isna().all():

                            arch_df["Date"] = pd.to_datetime(

                                [r[0] for r in clean],

                                errors="coerce"

                            )

                        arch_df = arch_df.dropna(subset=["Date"])

                        print(f"Archive rows : {len(arch_df)}")

                    else:

                        print("Date column not found.")

                        arch_df = pd.DataFrame()

                else:

                    print("Archive has no data.")

        except Exception as e:

            print("Archive Read Error :", e)

    # ===========================================
    # Merge Live + Archive
    # ===========================================

    if df_live is not None and not df_live.empty:

        live = df_live.copy()

        live["Date"] = pd.to_datetime(

            live["Date"],

            format="%Y-%m-%d",

            errors="coerce"

        )

        combined = pd.concat(

            [arch_df, live],

            ignore_index=True

        )

    else:

        combined = arch_df.copy()

    if combined.empty:

        return combined

    if "Date" not in combined.columns:

        print("Date column missing.")

        return combined

    combined = combined.drop_duplicates(

        subset=["Date"],

        keep="last"

    )

    combined = combined.sort_values("Date")

    # ===========================================
    # DEBUG BEFORE CONVERSION
    # ===========================================

    print("\n===================================")
    print("COMBINED BEFORE NUMERIC")
    print("===================================")
    print(combined.head(10))
    print("===================================\n")

    numeric_cols = [

    "Buy DII **",
    "Buy FII/FPI *",

    "Sell DII **",
    "Sell FII/FPI *",

    "Net DII **",
    "Net FII/FPI *"

]

    for col in numeric_cols:

        if col in combined.columns:

            combined[col] = (

                combined[col]

                .astype(str)

                .str.replace(",", "", regex=False)

                .str.replace("%", "", regex=False)

                .str.strip()

            )

            combined[col] = pd.to_numeric(

                combined[col],

                errors="coerce"

            )

    # ===========================================
    # DEBUG AFTER CONVERSION
    # ===========================================

    print("\n===================================")
    print("COMBINED AFTER NUMERIC")
    print("===================================")
    print(combined.head(10))
    print("===================================\n")

    result = combined.tail(30).reset_index(drop=True)

    print(f"FII/DII rows ready : {len(result)}")

    return result


# ══════════════════════════════════════════════════════════════
# 9.  PLOTTING
# ══════════════════════════════════════════════════════════════

def _fmt_lakh(x, _): return f"{abs(x)/1e5:.1f}L"
def _fmt_cr(x, _):   return f"₹{x/1000:.0f}K"

def plot_oi(df: pd.DataFrame, title: str, fname: str):

    if df.empty:
        print("No data.")
        return

    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates

    fig, ax = plt.subplots(figsize=(15,6))

    ax.plot(
        df["Date"],
        df["Future Index Long %"],
        color="green",
        linewidth=3,
        marker="o",
        markersize=5,
        label="Future Index Long %"
    )

    ax.plot(
        df["Date"],
        df["Future Index Short %"],
        color="red",
        linewidth=3,
        marker="o",
        markersize=5,
        label="Future Index Short %"
    )

    ax.set_title(
        "Future Index Long % and Future Index Short %",
        fontsize=16,
        fontweight="bold"
    )

    ax.set_ylabel("Percentage")

    ax.grid(True, alpha=0.3)

    ax.legend()

    ax.xaxis.set_major_formatter(
        mdates.DateFormatter("%d-%b")
    )

    plt.xticks(rotation=45)

    plt.tight_layout()

    plt.savefig(fname,dpi=300)

    plt.show()

def plot_fiidii(df):

    if df.empty:
        print("No FII/DII data available.")
        return

    import matplotlib.pyplot as plt
    import numpy as np

    print("\n===== Data for FII/DII Chart =====")
    print(df[["Date","Net FII/FPI *","Net DII **"]])
    print("==================================")

    df["Date"] = pd.to_datetime(df["Date"])

    x = np.arange(len(df))
    width = 0.35

    fig, ax = plt.subplots(figsize=(15,6))

    ax.bar(
        x-width/2,
        df["Net DII **"].astype(float),
        width,
        color="royalblue",
        label="Net DII"
    )

    ax.bar(
        x+width/2,
        df["Net FII/FPI *"].astype(float),
        width,
        color="red",
        label="Net FII/FPI"
    )

    ax.set_xticks(x)
    ax.set_xticklabels(
        df["Date"].dt.strftime("%d-%b"),
        rotation=45
    )

    ax.set_title(
        "Net DII vs Net FII/FPI (Last Trading Days)",
        fontsize=16,
        fontweight="bold"
    )

    ax.set_ylabel("₹ Crore")

    ax.axhline(0,color="black",linewidth=1)

    ax.grid(axis="y",alpha=.3)

    ax.legend()

    plt.tight_layout()

    plt.savefig("fii_dii_trade_chart.png",dpi=300)

    plt.show()

    plt.close(fig)

# ══════════════════════════════════════════════════════════════
# 10.  MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":

    print("\n" + "═"*62)
    print("  FII MASTER SCRIPT  v7  (CSV comma-parsing fix)")
    print("═"*62)

    trading_days = last_n_trading_days(30)
    print(f"\n📅 Trading days: {trading_days[0]}  →  {trading_days[-1]}")

    print("\n▶ STEP 1 — FAO Participant OI")
    archive_session = _build_session(USER_AGENTS[0])
    _warm_up(archive_session)
    sync_nse_csv_to_sheet("Sheet1",    URL_OI,  trading_days, archive_session)
    sync_nse_csv_to_sheet("FIIOIDATA", URL_OI,  trading_days, archive_session)

    print("\n▶ STEP 2 — FAO Participant Volume")
    sync_nse_csv_to_sheet("FIIVOLUMEDATA", URL_VOL, trading_days, archive_session)

    print("\n▶ STEP 3 — Live FII/DII Trade Data")
    df_live = fetch_live_fiidii()
    sync_fiidii_to_sheet(df_live)

    print("\n▶ STEP 4 — Reading sheets for charts …")
    df_oi  = read_oi_sheet("FIIOIDATA",     client_filter="FII")
    df_vol = read_oi_sheet("FIIVOLUMEDATA", client_filter="FII")
    df_fii = read_fiidii_archive(df_live)

    print("\n▶ STEP 4b — Exporting to dashboard …")
    import fiidii_export
    fiidii_export.export_fiidii_json(df_fii, df_oi)

    print("\n▶ STEP 5 — Generating charts …")
    plot_oi(
        df_oi,
        "Future Index %",
        "future_index_percentage.png"
    )

    plot_fiidii(df_fii)

    print("\n" + "═"*62)
    print("  ✅ ALL DONE")
    print("═"*62)