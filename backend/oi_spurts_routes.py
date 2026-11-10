import json
import logging
import threading
import time
from datetime import datetime, time as clock_time
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from fastapi import APIRouter

router = APIRouter(tags=["Market OI Spurts"])

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

NSE_HOME = "https://www.nseindia.com/"
NSE_PAGE = "https://www.nseindia.com/market-data/oi-spurts"
NSE_API = "https://www.nseindia.com/api/live-analysis-oi-spurts-contracts"

CACHE_FILE = Path(__file__).resolve().parent / "oi_spurts_cache.json"
CACHE_SECONDS = 60

CATEGORY_NAMES = {
    "RR": "Rise-in-OI-Rise",
    "RS": "Rise-in-OI-Slide",
    "SR": "Slide-in-OI-Rise",
    "SS": "Slide-in-OI-Slide",
}

FIELDS = [
    "symbol",
    "instrument",
    "expiryDate",
    "strikePrice",
    "optionType",
    "ltp",
    "prevClose",
    "pChange",
    "latestOI",
    "prevOI",
    "changeInOI",
    "pChangeInOI",
    "volume",
    "underlyingValue",
    "identifier",
    "instrumentType",
]

_lock = threading.Lock()
_last_data = None
_last_fetch_monotonic = 0.0


def _empty_categories():
    return {key: [] for key in CATEGORY_NAMES}


def _market_is_open(now):
    return (
        now.weekday() < 5
        and clock_time(9, 15) <= now.time().replace(tzinfo=None)
        <= clock_time(15, 30)
    )


def _load_disk_cache():
    global _last_data

    if _last_data is not None:
        return _last_data

    try:
        if CACHE_FILE.exists():
            with CACHE_FILE.open("r", encoding="utf-8") as handle:
                value = json.load(handle)

            if isinstance(value, dict) and isinstance(
                value.get("categories"), dict
            ):
                _last_data = value
                return value

    except Exception:
        logger.exception("Could not read OI Spurts cache.")

    return None


def _save_disk_cache(value):
    temporary = CACHE_FILE.with_suffix(".tmp")

    try:
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False)

        temporary.replace(CACHE_FILE)

    except Exception:
        logger.exception("Could not save OI Spurts cache.")


def _fetch_nse():
    session = requests.Session()

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/130.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Referer": NSE_PAGE,
        "Origin": "https://www.nseindia.com",
    }

    try:
        for attempt in range(3):
            try:
                session.get(
                    NSE_HOME,
                    headers=headers,
                    timeout=15,
                )

                session.get(
                    NSE_PAGE,
                    headers=headers,
                    timeout=15,
                )

                response = session.get(
                    NSE_API,
                    headers=headers,
                    timeout=20,
                )

                response.raise_for_status()
                payload = response.json()

                if not isinstance(payload, dict):
                    raise ValueError("Unexpected NSE response.")

                raw_groups = payload.get("data")

                if not isinstance(raw_groups, list):
                    raise ValueError("NSE data field is not a list.")

                timestamp = payload.get("timestamp")

                if not timestamp:
                    raise ValueError("NSE timestamp is missing.")

                parsed_timestamp = datetime.strptime(
                    timestamp,
                    "%d-%b-%Y %H:%M:%S",
                )

                now = datetime.now(IST)

                # Reject weekend or previous-session data returned
                # during a current weekday session.
                if parsed_timestamp.date() != now.date():
                    raise ValueError(
                        "NSE timestamp does not match today's date."
                    )

                categories = _empty_categories()

                for item in raw_groups:
                    if not isinstance(item, dict):
                        continue

                    for code, nse_name in CATEGORY_NAMES.items():
                        records = item.get(nse_name)

                        if not isinstance(records, list):
                            continue

                        cleaned = []

                        for record in records:
                            if not isinstance(record, dict):
                                continue

                            row = {
                                field: record.get(field)
                                for field in FIELDS
                            }

                            cleaned.append(row)

                        categories[code].extend(cleaned)

                if not any(categories.values()):
                    raise ValueError("NSE returned no OI Spurts records.")

                for rows in categories.values():
                    rows.sort(
                        key=lambda row: abs(
                            float(row.get("changeInOI") or 0)
                        ),
                        reverse=True,
                    )

                return {
                    "source": "NSE India",
                    "asOf": timestamp,
                    "tradingDate": payload.get("currTradingDate"),
                    "previousTradingDate": payload.get("prevTradingDate"),
                    "categories": categories,
                    "fetchedAt": now.isoformat(),
                }

            except Exception:
                logger.warning(
                    "NSE OI Spurts attempt %s failed.",
                    attempt + 1,
                    exc_info=True,
                )

                if attempt < 2:
                    time.sleep(2)

        return None

    finally:
        session.close()


@router.get("/api/market/oi-spurts")
def get_oi_spurts():
    global _last_data, _last_fetch_monotonic

    now = datetime.now(IST)
    market_open = _market_is_open(now)

    with _lock:
        cached = _load_disk_cache()

        if not market_open:
            if cached:
                return {
                    **cached,
                    "marketOpen": False,
                    "stale": True,
                    "cached": True,
                    "message": "Market closed. Showing last valid NSE snapshot.",
                }

            return {
                "source": "NSE India",
                "asOf": None,
                "tradingDate": None,
                "marketOpen": False,
                "stale": True,
                "cached": False,
                "message": "Market closed. No cached NSE snapshot is available yet.",
                "categories": _empty_categories(),
            }

        if (
            cached
            and time.monotonic() - _last_fetch_monotonic < CACHE_SECONDS
        ):
            return {
                **cached,
                "marketOpen": True,
                "stale": False,
                "cached": True,
                "message": "Using recently fetched NSE data.",
            }

        fresh = _fetch_nse()

        if fresh:
            _last_data = fresh
            _last_fetch_monotonic = time.monotonic()
            _save_disk_cache(fresh)

            return {
                **fresh,
                "marketOpen": True,
                "stale": False,
                "cached": False,
                "message": "NSE data fetched successfully.",
            }

        if cached:
            return {
                **cached,
                "marketOpen": True,
                "stale": True,
                "cached": True,
                "message": "NSE unavailable. Showing last valid snapshot.",
            }

        return {
            "source": "NSE India",
            "asOf": None,
            "tradingDate": None,
            "marketOpen": True,
            "stale": True,
            "cached": False,
            "message": "NSE data is temporarily unavailable.",
            "categories": _empty_categories(),
        }
