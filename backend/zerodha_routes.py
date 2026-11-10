
"""
Zerodha integration for DerivaSense AI.

Personal Kite Connect:
- Admin-only login URL generation
- One-time state validation on callback
- Server-side request-token exchange
- In-memory access-token storage
- Admin-only profile and connection status

Live order placement is deliberately not implemented here.
"""

import logging
import os
import secrets
import time

from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from kiteconnect import KiteConnect

from auth import get_current_admin


logger = logging.getLogger(__name__)

# Load the backend's existing .env file.
ENV_FILE = Path(__file__).resolve().with_name(".env")
load_dotenv(dotenv_path=ENV_FILE, override=False)

ZERODHA_API_KEY = os.getenv("ZERODHA_API_KEY", "").strip()
ZERODHA_API_SECRET = os.getenv("ZERODHA_API_SECRET", "").strip()

router = APIRouter(
    prefix="/api/zerodha",
    tags=["Zerodha"],
)

# Tokens are kept only in this Python process.
# Restarting FastAPI clears the session.
_access_token = None
_connected_profile = None
_connected_at = None

# One-time login states, valid for 10 minutes.
_pending_states = {}
# Options instrument master cache (15 minutes).
# Equity instrument master cache (15 minutes).
_equity_instruments_cache = {}
_EQUITY_INSTRUMENTS_CACHE_SECONDS = 15 * 60

_option_instruments_cache = {}
_OPTION_INSTRUMENTS_CACHE_SECONDS = 15 * 60


def _create_kite_client():
    if not ZERODHA_API_KEY or not ZERODHA_API_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Zerodha API credentials are not configured.",
        )

    return KiteConnect(api_key=ZERODHA_API_KEY)


def _safe_profile(profile):
    """Return only non-secret account profile fields."""

    allowed_fields = [
        "user_id",
        "user_name",
        "user_shortname",
        "email",
        "broker",
        "exchanges",
        "products",
        "order_types",
    ]

    return {
        key: profile.get(key)
        for key in allowed_fields
        if key in profile
    }


def _html_response(title, message, status_code=200):
    html = f"""
    <!doctype html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{title} - DerivaSense AI</title>
    </head>
    <body style="font-family:Arial,sans-serif;
                 max-width:650px;margin:70px auto;
                 padding:20px;line-height:1.6">
        <h2>{title}</h2>
        <p>{message}</p>
        <p>You may close this window and return to DerivaSense.</p>
    </body>
    </html>
    """

    return HTMLResponse(
        content=html,
        status_code=status_code,
    )


@router.get("/login-url")
def get_zerodha_login_url(
    current_admin=Depends(get_current_admin),
):
    """Generate a protected Zerodha login URL."""

    kite = _create_kite_client()

    # Remove expired login states.
    now = time.time()

    expired = [
        state
        for state, expiry in _pending_states.items()
        if expiry <= now
    ]

    for state in expired:
        _pending_states.pop(state, None)

    if len(_pending_states) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many pending Zerodha login attempts.",
        )

    state = secrets.token_urlsafe(32)

    _pending_states[state] = now + 600

    # Zerodha returns redirect_params to our callback.
    redirect_params = quote(
        f"state={state}",
        safe="",
    )

    login_url = (
        kite.login_url()
        + "&redirect_params="
        + redirect_params
    )

    return {
        "login_url": login_url,
        "expires_in_seconds": 600,
        "message": "Open the login URL to authenticate with Zerodha.",
    }


@router.get(
    "/callback",
    response_class=HTMLResponse,
)
def zerodha_callback(
    request_token: str = None,
    status: str = None,
    state: str = None,
):
    """
    Public broker callback.

    The one-time state proves that this callback corresponds
    to a login initiated through the protected admin endpoint.
    """

    global _access_token
    global _connected_profile
    global _connected_at

    if not state:
        return _html_response(
            "Zerodha login rejected",
            "The login state is missing. Please restart login.",
            400,
        )

    expiry = _pending_states.pop(state, None)

    if expiry is None or expiry <= time.time():
        return _html_response(
            "Zerodha login expired",
            "The login request is invalid or expired. Please restart login.",
            400,
        )

    if status != "success" or not request_token:
        return _html_response(
            "Zerodha login not completed",
            "Zerodha did not return a successful login. Please try again.",
            400,
        )

    try:
        kite = _create_kite_client()

        session_data = kite.generate_session(
            request_token,
            api_secret=ZERODHA_API_SECRET,
        )

        new_access_token = session_data.get("access_token")

        if not new_access_token:
            raise RuntimeError("Access token was not returned.")

        kite.set_access_token(new_access_token)

        # Verify the authenticated Zerodha account.
        profile = kite.profile()

        # Save only after profile verification succeeds.
        _access_token = new_access_token
        _connected_profile = _safe_profile(profile)
        _connected_at = time.time()

        logger.info(
            "Zerodha account connected successfully."
        )

        return _html_response(
            "Zerodha connected successfully",
            "Your Zerodha account is authenticated with DerivaSense AI.",
        )

    except Exception:
        # Never return API secrets, request tokens or access tokens.
        logger.exception(
            "Zerodha authentication or profile verification failed."
        )

        return _html_response(
            "Zerodha connection failed",
            "Authentication could not be completed. Please restart login "
            "and check the FastAPI terminal for the error.",
            502,
        )


@router.get("/status")
def get_zerodha_status(
    current_admin=Depends(get_current_admin),
):
    """Return the current in-memory broker connection status."""

    return {
        "connected": _access_token is not None,
        "profile": _connected_profile,
        "connected_at": _connected_at,
        "token_storage": "server_memory_only",
    }


@router.get("/profile")
def get_zerodha_profile(
    current_admin=Depends(get_current_admin),
):
    """Fetch the authenticated Zerodha profile."""

    if not _access_token:
        raise HTTPException(
            status_code=401,
            detail="Zerodha is not connected. Please login first.",
        )

    try:
        kite = _create_kite_client()
        kite.set_access_token(_access_token)

        profile = kite.profile()

        return {
            "connected": True,
            "profile": _safe_profile(profile),
        }

    except Exception:
        logger.exception(
            "Unable to retrieve Zerodha profile."
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Could not retrieve the Zerodha profile. "
                "Please check the connection or login again."
            ),
        )


@router.post("/disconnect")
def disconnect_zerodha(
    current_admin=Depends(get_current_admin),
):
    """Clear the local in-memory broker session."""

    global _access_token
    global _connected_profile
    global _connected_at

    _access_token = None
    _connected_profile = None
    _connected_at = None

    return {
        "connected": False,
        "message": "Local DerivaSense Zerodha session cleared.",
    }
# ============================================================
# READ-ONLY ZERODHA ACCOUNT DASHBOARD
# ============================================================

def _authenticated_kite_client():
    """Create an authenticated client using the local session."""

    if not _access_token:
        raise HTTPException(
            status_code=401,
            detail="Zerodha is not connected. Please login first.",
        )

    kite = _create_kite_client()
    kite.set_access_token(_access_token)

    return kite

# ============================================================
# OPTIONS INSTRUMENT MASTER (READ-ONLY)
# ============================================================

@router.get("/instruments/options")
def get_zerodha_option_instruments(
    exchange: str = "NFO",
    underlying: str = None,
    expiry: str = None,
    option_type: str = "ALL",
    limit: int = 300,
    current_admin=Depends(get_current_admin),
):
    """Read-only, filtered Zerodha option contract discovery."""

    exchange = exchange.strip().upper()
    option_type = option_type.strip().upper()
    underlying = underlying.strip().upper() if underlying else None
    expiry = expiry.strip() if expiry else None

    if exchange not in {"NFO", "BFO"}:
        raise HTTPException(status_code=400, detail="Exchange must be NFO or BFO.")

    if option_type not in {"ALL", "CE", "PE"}:
        raise HTTPException(status_code=400, detail="Option type must be ALL, CE or PE.")

    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 1000.")

    now = time.time()
    cached = _option_instruments_cache.get(exchange)
    cache_hit = bool(
        cached
        and now - cached["cached_at"] < _OPTION_INSTRUMENTS_CACHE_SECONDS
    )

    if cache_hit:
        instruments = cached["instruments"]
    else:
        kite = _authenticated_kite_client()

        try:
            raw_instruments = kite.instruments(exchange)
            instruments = []

            for item in raw_instruments:
                if item.get("instrument_type") not in {"CE", "PE"}:
                    continue

                instruments.append({
                    "instrument_token": item.get("instrument_token"),
                    "exchange": item.get("exchange"),
                    "tradingsymbol": item.get("tradingsymbol"),
                    "name": item.get("name"),
                    "expiry": item.get("expiry"),
                    "strike": item.get("strike"),
                    "lot_size": item.get("lot_size"),
                    "tick_size": item.get("tick_size"),
                    "instrument_type": item.get("instrument_type"),
                    "segment": item.get("segment"),
                })

            instruments.sort(
                key=lambda item: (
                    str(item.get("name") or ""),
                    str(item.get("expiry") or ""),
                    float(item.get("strike") or 0),
                    str(item.get("instrument_type") or ""),
                )
            )

            _option_instruments_cache[exchange] = {
                "cached_at": now,
                "instruments": instruments,
            }

        except Exception:
            logger.exception(
                "Zerodha %s options instrument retrieval failed.", exchange
            )
            raise HTTPException(
                status_code=502,
                detail="Unable to retrieve Zerodha option instruments.",
            )

    available_underlyings = sorted({
        str(item.get("name") or "").strip().upper()
        for item in instruments
        if item.get("name")
    })

    if not underlying:
        return {
            "success": True,
            "exchange": exchange,
            "cached": cache_hit,
            "available_underlyings": available_underlyings,
            "available_expiries": [],
            "total_count": 0,
            "count": 0,
            "requires_underlying": True,
            "instruments": [],
        }

    underlying_items = [
        item for item in instruments
        if str(item.get("name") or "").strip().upper() == underlying
    ]

    available_expiries = sorted({
        str(item.get("expiry"))[:10]
        for item in underlying_items
        if item.get("expiry")
    })

    if not expiry:
        return {
            "success": True,
            "exchange": exchange,
            "cached": cache_hit,
            "underlying": underlying,
            "available_underlyings": available_underlyings,
            "available_expiries": available_expiries,
            "total_count": 0,
            "count": 0,
            "requires_expiry": True,
            "instruments": [],
        }

    if expiry not in available_expiries:
        raise HTTPException(
            status_code=400,
            detail="Selected expiry is not available for this underlying.",
        )

    matching = [
        item for item in underlying_items
        if str(item.get("expiry"))[:10] == expiry
        and (
            option_type == "ALL"
            or str(item.get("instrument_type") or "").upper() == option_type
        )
    ]

    return {
        "success": True,
        "exchange": exchange,
        "cached": cache_hit,
        "underlying": underlying,
        "expiry": expiry,
        "option_type": option_type,
        "available_expiries": available_expiries,
        "total_count": len(matching),
        "count": min(len(matching), limit),
        "limit": limit,
        "truncated": len(matching) > limit,
        "instruments": matching[:limit],
    }

# ============================================================


@router.post("/margins/estimate")
def estimate_zerodha_order_margin(
    payload: dict,
    current_admin=Depends(get_current_admin),
):
    """Estimate margin for one options order. Never places an order."""

    exchange = str(payload.get("exchange") or "").strip().upper()
    tradingsymbol = str(payload.get("tradingsymbol") or "").strip().upper()
    transaction_type = str(
        payload.get("transaction_type") or ""
    ).strip().upper()
    product = str(payload.get("product") or "NRML").strip().upper()
    order_type = str(payload.get("order_type") or "").strip().upper()

    if exchange not in {"NFO", "BFO"}:
        raise HTTPException(
            status_code=400,
            detail="Exchange must be NFO or BFO.",
        )

    if not tradingsymbol:
        raise HTTPException(
            status_code=400,
            detail="A trading symbol is required.",
        )

    if transaction_type not in {"BUY", "SELL"}:
        raise HTTPException(
            status_code=400,
            detail="Transaction type must be BUY or SELL.",
        )

    if product not in {"NRML", "MIS"}:
        raise HTTPException(
            status_code=400,
            detail="Product must be NRML or MIS.",
        )

    if order_type not in {"LIMIT", "MARKET"}:
        raise HTTPException(
            status_code=400,
            detail="Order type must be LIMIT or MARKET.",
        )

    raw_quantity = payload.get("quantity")

    if isinstance(raw_quantity, bool):
        raise HTTPException(
            status_code=400,
            detail="Quantity must be a positive whole number.",
        )

    try:
        quantity = int(raw_quantity)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(
            status_code=400,
            detail="Quantity must be a positive whole number.",
        )

    if quantity <= 0 or str(quantity) != str(raw_quantity).strip():
        raise HTTPException(
            status_code=400,
            detail="Quantity must be a positive whole number.",
        )

    try:
        price = float(payload.get("price") or 0)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(
            status_code=400,
            detail="Price must be numeric.",
        )

    if price != price or price in (
        float("inf"),
        float("-inf"),
    ):
        raise HTTPException(
            status_code=400,
            detail="Price must be a finite number.",
        )

    if order_type == "LIMIT" and price <= 0:
        raise HTTPException(
            status_code=400,
            detail="A positive limit price is required.",
        )

    if order_type == "MARKET":
        price = 0.0

    # Authenticate using the existing local Zerodha session.
    kite = _authenticated_kite_client()

    # Reuse the existing 15-minute options instrument cache.
    now = time.time()
    cached = _option_instruments_cache.get(exchange)

    cache_hit = bool(
        cached
        and now - cached["cached_at"]
        < _OPTION_INSTRUMENTS_CACHE_SECONDS
    )

    if cache_hit:
        instruments = cached["instruments"]
    else:
        try:
            raw_instruments = kite.instruments(exchange)
            instruments = []

            for item in raw_instruments:
                if item.get("instrument_type") not in {"CE", "PE"}:
                    continue

                instruments.append({
                    "instrument_token": item.get("instrument_token"),
                    "exchange": item.get("exchange"),
                    "tradingsymbol": item.get("tradingsymbol"),
                    "name": item.get("name"),
                    "expiry": item.get("expiry"),
                    "strike": item.get("strike"),
                    "lot_size": item.get("lot_size"),
                    "tick_size": item.get("tick_size"),
                    "instrument_type": item.get("instrument_type"),
                    "segment": item.get("segment"),
                })

            _option_instruments_cache[exchange] = {
                "cached_at": now,
                "instruments": instruments,
            }

        except Exception:
            logger.exception(
                "Zerodha %s options instrument refresh failed "
                "during margin estimation.",
                exchange,
            )

            raise HTTPException(
                status_code=502,
                detail="Unable to verify the option contract with Zerodha.",
            )

    # Verify the selected contract against Zerodha's instrument master.
    contract = next(
        (
            item
            for item in instruments
            if str(
                item.get("tradingsymbol") or ""
            ).upper() == tradingsymbol
            and str(
                item.get("exchange") or ""
            ).upper() == exchange
        ),
        None,
    )

    if not contract:
        raise HTTPException(
            status_code=404,
            detail=(
                "Contract not found in the current Zerodha options "
                "instrument master. Refresh the contract list and try again."
            ),
        )

    try:
        lot_size = int(contract.get("lot_size") or 0)
        tick_size = float(contract.get("tick_size") or 0)

    except (TypeError, ValueError, OverflowError):
        raise HTTPException(
            status_code=502,
            detail="Zerodha contract metadata is invalid.",
        )

    if lot_size <= 0 or quantity % lot_size != 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Quantity must be a multiple of the contract lot size "
                f"({lot_size})."
            ),
        )

    # Validate the manually entered LIMIT price against tick size.
    if order_type == "LIMIT":

        if tick_size <= 0:
            raise HTTPException(
                status_code=502,
                detail="Zerodha contract tick-size metadata is invalid.",
            )

        nearest_tick_price = round(price / tick_size) * tick_size

        if abs(price - nearest_tick_price) > 0.0000001:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Limit price must be in increments of "
                    f"Rs. {tick_size:g}."
                ),
            )

    # Fixed regular variety. This is a margin request only.
    order_params = {
        "exchange": exchange,
        "tradingsymbol": tradingsymbol,
        "transaction_type": transaction_type,
        "variety": "regular",
        "product": product,
        "order_type": order_type,
        "quantity": quantity,
        "price": price,
        "trigger_price": 0,
    }

    # Ask Zerodha for its actual margin estimate.
    try:
        margin_result = kite.order_margins([order_params])

    except Exception:
        logger.exception(
            "Zerodha order margin estimation failed for %s.",
            tradingsymbol,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Zerodha could not estimate margin for this draft. "
                "Verify the details and try again."
            ),
        )

    if isinstance(margin_result, list):

        if not margin_result:
            raise HTTPException(
                status_code=502,
                detail="Zerodha returned no margin estimate.",
            )

        margin_details = margin_result[0]

    elif isinstance(margin_result, dict):
        margin_details = margin_result

    else:
        raise HTTPException(
            status_code=502,
            detail="Zerodha returned an unexpected margin response.",
        )

    return {
        "success": True,
        "estimate_only": True,
        "estimated_at": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(),
        ),
        "order": {
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "transaction_type": transaction_type,
            "product": product,
            "order_type": order_type,
            "quantity": quantity,
            "price": price,
            "lot_size": lot_size,
            "tick_size": tick_size,
        },
        "margin": margin_details,
    }



@router.get("/funds")
def get_zerodha_funds(
    current_admin=Depends(get_current_admin),
):
    """Retrieve equity and commodity funds/margins."""

    kite = _authenticated_kite_client()

    try:
        return {
            "success": True,
            "funds": kite.margins(),
        }

    except Exception:
        logger.exception("Zerodha funds retrieval failed.")

        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve Zerodha funds.",
        )


# ============================================================
# EQUITY HOLDINGS
# ============================================================

@router.get("/holdings")
def get_zerodha_holdings(
    current_admin=Depends(get_current_admin),
):
    """Retrieve long-term equity holdings."""

    kite = _authenticated_kite_client()

    try:
        return {
            "success": True,
            "holdings": kite.holdings(),
        }

    except Exception:
        logger.exception("Zerodha holdings retrieval failed.")

        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve Zerodha holdings.",
        )


# ============================================================
# OPEN POSITIONS
# ============================================================

@router.get("/positions")
def get_zerodha_positions(
    current_admin=Depends(get_current_admin),
):
    """Retrieve net and day positions."""

    kite = _authenticated_kite_client()

    try:
        return {
            "success": True,
            "positions": kite.positions(),
        }

    except Exception:
        logger.exception("Zerodha positions retrieval failed.")

        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve Zerodha positions.",
        )


# ============================================================
# DAILY ORDER BOOK
# ============================================================

@router.get("/orders")
def get_zerodha_orders(
    current_admin=Depends(get_current_admin),
):
    """Retrieve today's orders. Read-only."""

    kite = _authenticated_kite_client()

    try:
        return {
            "success": True,
            "orders": kite.orders(),
        }

    except Exception:
        logger.exception("Zerodha order retrieval failed.")

        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve Zerodha orders.",
        )


# ============================================================
# DAILY TRADE BOOK
# ============================================================

@router.get("/trades")
def get_zerodha_trades(
    current_admin=Depends(get_current_admin),
):
    """Retrieve today's executed trades. Read-only."""

    kite = _authenticated_kite_client()

    try:
        return {
            "success": True,
            "trades": kite.trades(),
        }

    except Exception:
        logger.exception("Zerodha trades retrieval failed.")

        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve Zerodha trades.",
        )


# ============================================================
# NSE EQUITY INSTRUMENT MASTER (READ-ONLY)
# ============================================================

@router.get("/instruments/equity")
def get_zerodha_equity_instruments(
    search: str = "",
    limit: int = 30,
    current_admin=Depends(get_current_admin),
):
    """Search NSE-listed equity shares. Read-only."""

    search = str(search or "").strip().upper()

    if len(search) < 2:
        raise HTTPException(
            status_code=400,
            detail="Enter at least two characters to search.",
        )

    if len(search) > 40:
        raise HTTPException(
            status_code=400,
            detail="Search text is too long.",
        )

    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100.",
        )

    now = time.time()
    cached = _equity_instruments_cache.get("NSE")

    cache_hit = bool(
        cached
        and now - cached["cached_at"]
        < _EQUITY_INSTRUMENTS_CACHE_SECONDS
    )

    if cache_hit:
        instruments = cached["instruments"]
    else:
        kite = _authenticated_kite_client()

        try:
            raw_instruments = kite.instruments("NSE")
            instruments = []

            for item in raw_instruments:
                if str(item.get("instrument_type") or "").upper() != "EQ":
                    continue

                if str(item.get("exchange") or "").upper() != "NSE":
                    continue

                instruments.append({
                    "instrument_token": item.get("instrument_token"),
                    "exchange": item.get("exchange"),
                    "tradingsymbol": item.get("tradingsymbol"),
                    "name": item.get("name"),
                    "lot_size": item.get("lot_size"),
                    "tick_size": item.get("tick_size"),
                    "instrument_type": item.get("instrument_type"),
                    "segment": item.get("segment"),
                })

            instruments.sort(
                key=lambda item: str(
                    item.get("tradingsymbol") or ""
                )
            )

            _equity_instruments_cache["NSE"] = {
                "cached_at": now,
                "instruments": instruments,
            }

        except Exception:
            logger.exception(
                "Zerodha NSE equity instrument retrieval failed."
            )
            raise HTTPException(
                status_code=502,
                detail="Unable to retrieve NSE equity instruments.",
            )

    matching = [
        item for item in instruments
        if search in str(item.get("tradingsymbol") or "").upper()
        or search in str(item.get("name") or "").upper()
    ]

    matching.sort(
        key=lambda item: (
            0 if str(item.get("tradingsymbol") or "").upper() == search else 1,
            str(item.get("tradingsymbol") or ""),
        )
    )

    return {
        "success": True,
        "exchange": "NSE",
        "cached": cache_hit,
        "search": search,
        "total_count": len(matching),
        "count": min(len(matching), limit),
        "truncated": len(matching) > limit,
        "instruments": matching[:limit],
    }



# ============================================================
# NSE EQUITY QUOTE (READ-ONLY)
# ============================================================

@router.get("/quote/equity")
def get_zerodha_equity_quote(
    tradingsymbol: str,
    current_admin=Depends(get_current_admin),
):
    """Retrieve a quote for a verified NSE equity share. Read-only."""

    tradingsymbol = str(tradingsymbol or "").strip().upper()

    if not tradingsymbol or len(tradingsymbol) > 40:
        raise HTTPException(
            status_code=400,
            detail="A valid trading symbol is required.",
        )

    kite = _authenticated_kite_client()

    now = time.time()
    cached = _equity_instruments_cache.get("NSE")

    cache_hit = bool(
        cached
        and now - cached["cached_at"]
        < _EQUITY_INSTRUMENTS_CACHE_SECONDS
    )

    if cache_hit:
        instruments = cached["instruments"]
    else:
        try:
            raw_instruments = kite.instruments("NSE")
            instruments = []

            for item in raw_instruments:
                if (
                    str(item.get("instrument_type") or "").upper() == "EQ"
                    and str(item.get("exchange") or "").upper() == "NSE"
                ):
                    instruments.append({
                        "instrument_token": item.get("instrument_token"),
                        "exchange": item.get("exchange"),
                        "tradingsymbol": item.get("tradingsymbol"),
                        "name": item.get("name"),
                        "lot_size": item.get("lot_size"),
                        "tick_size": item.get("tick_size"),
                        "instrument_type": item.get("instrument_type"),
                        "segment": item.get("segment"),
                    })

            _equity_instruments_cache["NSE"] = {
                "cached_at": now,
                "instruments": instruments,
            }

        except Exception:
            logger.exception("Zerodha NSE equity instrument refresh failed.")
            raise HTTPException(
                status_code=502,
                detail="Unable to verify the NSE equity symbol.",
            )

    instrument = next(
        (
            item for item in instruments
            if str(item.get("tradingsymbol") or "").upper()
            == tradingsymbol
        ),
        None,
    )

    if not instrument:
        raise HTTPException(
            status_code=404,
            detail="Symbol is not present in the NSE equity instrument master.",
        )

    try:
        quote_key = f"NSE:{tradingsymbol}"
        quote_response = kite.quote([quote_key])
        quote_data = quote_response.get(quote_key)

        if not isinstance(quote_data, dict):
            raise HTTPException(
                status_code=502,
                detail="Zerodha did not return a quote for this equity.",
            )

        last_price = float(quote_data.get("last_price") or 0)

        if last_price <= 0 or last_price != last_price:
            raise HTTPException(
                status_code=502,
                detail="Zerodha returned an invalid equity quote.",
            )

        return {
            "success": True,
            "exchange": "NSE",
            "tradingsymbol": tradingsymbol,
            "name": instrument.get("name"),
            "instrument_token": instrument.get("instrument_token"),
            "last_price": last_price,
            "net_change": quote_data.get("net_change"),
            "ohlc": quote_data.get("ohlc"),
            "volume": quote_data.get("volume"),
            "average_price": quote_data.get("average_price"),
            "last_trade_time": quote_data.get("last_trade_time"),
            "quote_timestamp": quote_data.get("timestamp"),
            "tick_size": instrument.get("tick_size"),
            "quote_source": "Zerodha Kite",
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception(
            "Zerodha NSE equity quote retrieval failed for %s.",
            tradingsymbol,
        )
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve the Zerodha equity quote.",
        )



# ============================================================
# NSE EQUITY MARGIN ESTIMATOR — DRAFT ONLY
# ============================================================

@router.post("/equity/margins/estimate")
def estimate_zerodha_equity_margin(
    payload: dict,
    current_admin=Depends(get_current_admin),
):
    """Estimate NSE equity order margin. Never places an order."""

    exchange = str(payload.get("exchange") or "NSE").strip().upper()
    tradingsymbol = str(
        payload.get("tradingsymbol") or ""
    ).strip().upper()
    transaction_type = str(
        payload.get("transaction_type") or ""
    ).strip().upper()
    product = str(payload.get("product") or "CNC").strip().upper()
    order_type = str(payload.get("order_type") or "").strip().upper()

    if exchange != "NSE":
        raise HTTPException(
            status_code=400,
            detail="Only NSE equity orders are supported currently.",
        )

    if not tradingsymbol or len(tradingsymbol) > 40:
        raise HTTPException(
            status_code=400,
            detail="A valid NSE trading symbol is required.",
        )

    if transaction_type not in {"BUY", "SELL"}:
        raise HTTPException(
            status_code=400,
            detail="Transaction type must be BUY or SELL.",
        )

    if product not in {"CNC", "MIS"}:
        raise HTTPException(
            status_code=400,
            detail="Product must be CNC or MIS.",
        )

    if order_type not in {"LIMIT", "MARKET"}:
        raise HTTPException(
            status_code=400,
            detail="Order type must be LIMIT or MARKET.",
        )

    raw_quantity = payload.get("quantity")

    if isinstance(raw_quantity, bool):
        raise HTTPException(
            status_code=400,
            detail="Quantity must be a positive whole number.",
        )

    try:
        quantity = int(raw_quantity)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(
            status_code=400,
            detail="Quantity must be a positive whole number.",
        )

    if quantity <= 0 or str(quantity) != str(raw_quantity).strip():
        raise HTTPException(
            status_code=400,
            detail="Quantity must be a positive whole number.",
        )

    try:
        price = float(payload.get("price") or 0)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(
            status_code=400,
            detail="Price must be numeric.",
        )

    if price != price or price in (float("inf"), float("-inf")):
        raise HTTPException(
            status_code=400,
            detail="Price must be a finite number.",
        )

    if order_type == "LIMIT" and price <= 0:
        raise HTTPException(
            status_code=400,
            detail="A positive limit price is required.",
        )

    if order_type == "MARKET":
        price = 0.0

    kite = _authenticated_kite_client()

    # Verify the share against the current NSE equity instrument master.
    now = time.time()
    cached = _equity_instruments_cache.get("NSE")

    cache_hit = bool(
        cached
        and now - cached["cached_at"]
        < _EQUITY_INSTRUMENTS_CACHE_SECONDS
    )

    if cache_hit:
        instruments = cached["instruments"]
    else:
        try:
            raw_instruments = kite.instruments("NSE")
            instruments = [
                {
                    "instrument_token": item.get("instrument_token"),
                    "exchange": item.get("exchange"),
                    "tradingsymbol": item.get("tradingsymbol"),
                    "name": item.get("name"),
                    "lot_size": item.get("lot_size"),
                    "tick_size": item.get("tick_size"),
                    "instrument_type": item.get("instrument_type"),
                    "segment": item.get("segment"),
                }
                for item in raw_instruments
                if str(item.get("exchange") or "").upper() == "NSE"
                and str(item.get("instrument_type") or "").upper() == "EQ"
            ]

            _equity_instruments_cache["NSE"] = {
                "cached_at": now,
                "instruments": instruments,
            }

        except Exception:
            logger.exception(
                "NSE equity instrument refresh failed during margin estimation."
            )
            raise HTTPException(
                status_code=502,
                detail="Unable to verify the NSE equity instrument.",
            )

    contract = next(
        (
            item for item in instruments
            if str(item.get("tradingsymbol") or "").upper()
            == tradingsymbol
            and str(item.get("exchange") or "").upper() == "NSE"
        ),
        None,
    )

    if not contract:
        raise HTTPException(
            status_code=404,
            detail="Share not found in Zerodha's NSE equity instrument master.",
        )

    try:
        tick_size = float(contract.get("tick_size") or 0)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(
            status_code=502,
            detail="Zerodha equity tick-size metadata is invalid.",
        )

    if tick_size <= 0:
        raise HTTPException(
            status_code=502,
            detail="Zerodha equity tick-size metadata is invalid.",
        )

    if order_type == "LIMIT":
        nearest_tick_price = round(price / tick_size) * tick_size

        if abs(price - nearest_tick_price) > 0.0000001:
            raise HTTPException(
                status_code=400,
                detail=f"Limit price must be in increments of Rs. {tick_size:g}.",
            )

    # CNC SELL: conservatively check settled holding quantity.
    # T1/unsettled shares are not counted as available here.
    if transaction_type == "SELL" and product == "CNC":
        try:
            holdings = kite.holdings()
        except Exception:
            logger.exception(
                "Zerodha holdings retrieval failed during CNC sell validation."
            )
            raise HTTPException(
                status_code=502,
                detail="Unable to verify available CNC holdings.",
            )

        holding = next(
            (
                item for item in holdings
                if str(item.get("tradingsymbol") or "").upper()
                == tradingsymbol
                and str(item.get("exchange") or "").upper() == "NSE"
            ),
            None,
        )

        if not holding:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No settled CNC holdings found for {tradingsymbol}. "
                    "CNC SELL estimate is not available."
                ),
            )

        try:
            held_quantity = int(holding.get("quantity") or 0)
            used_quantity = int(holding.get("used_quantity") or 0)
        except (TypeError, ValueError, OverflowError):
            raise HTTPException(
                status_code=502,
                detail="Zerodha returned invalid holding quantity data.",
            )

        available_quantity = max(0, held_quantity - used_quantity)

        if quantity > available_quantity:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Requested quantity {quantity} exceeds the "
                    f"conservatively available CNC quantity "
                    f"{available_quantity} for {tradingsymbol}."
                ),
            )

    # LIMIT drafts use the user's entered price.
    # MARKET drafts cannot be estimated without market-data permission.
    if order_type == "MARKET":
        raise HTTPException(
            status_code=403,
            detail=(
                "MARKET draft saved only in the ticket. "
                "Margin estimation requires Zerodha market-data permission. "
                "Use LIMIT with a valid price for estimation."
            ),
        )

    indicative_price = price
    quote_data = None

    reference_price = price if order_type == "LIMIT" else indicative_price
    indicative_value = round(quantity * reference_price, 2)

    order_params = {
        "exchange": "NSE",
        "tradingsymbol": tradingsymbol,
        "transaction_type": transaction_type,
        "variety": "regular",
        "product": product,
        "order_type": order_type,
        "quantity": quantity,
        "price": price,
        "trigger_price": 0,
    }

    # Margin estimate only. No place_order/modify_order/cancel_order call.
    try:
        margin_result = kite.order_margins([order_params])

    except Exception:
        logger.exception(
            "Zerodha equity margin estimation failed for %s.",
            tradingsymbol,
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "Zerodha could not estimate margin for this equity draft. "
                "Verify the details and account permissions."
            ),
        )

    if isinstance(margin_result, list):
        if not margin_result:
            raise HTTPException(
                status_code=502,
                detail="Zerodha returned no equity margin estimate.",
            )
        margin_details = margin_result[0]

    elif isinstance(margin_result, dict):
        margin_details = margin_result

    else:
        raise HTTPException(
            status_code=502,
            detail="Zerodha returned an unexpected margin response.",
        )

    quote_timestamp = None

    return {
        "success": True,
        "estimate_only": True,
        "estimated_at": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(),
        ),
        "order": {
            "exchange": "NSE",
            "tradingsymbol": tradingsymbol,
            "name": contract.get("name"),
            "transaction_type": transaction_type,
            "product": product,
            "order_type": order_type,
            "quantity": quantity,
            "price": price,
            "tick_size": tick_size,
            "indicative_price": indicative_price,
            "indicative_value": indicative_value,
            "quote_timestamp": str(quote_timestamp) if quote_timestamp else None,
        },
        "margin": margin_details,
    }
