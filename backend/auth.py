import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError

from database import get_db
from models import User


# ============================================================
# LOAD ENVIRONMENT VARIABLES
# ============================================================

load_dotenv()


# ============================================================
# JWT CONFIGURATION
# ============================================================

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_KEY"
)

ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256"
)

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        "1440"
    )
)


# ============================================================
# PASSWORD HASHING
# ============================================================

password_hasher = PasswordHasher()


# ============================================================
# OAUTH2
# ============================================================

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login"
)


# ============================================================
# PASSWORD FUNCTIONS
# ============================================================

def hash_password(password: str) -> str:
    """
    Hash a plain-text password using Argon2.
    """
    return password_hasher.hash(password)


def verify_password(
    password: str,
    hashed_password: str
) -> bool:
    """
    Verify a plain-text password against
    an Argon2 password hash.
    """

    try:
        return password_hasher.verify(
            hashed_password,
            password
        )

    except (
        VerifyMismatchError,
        VerificationError
    ):
        return False


# ============================================================
# USER AUTHENTICATION
# ============================================================

def authenticate_user(
    db: Session,
    email: str,
    password: str
) -> Optional[User]:
    """
    Authenticate a user using email and password.

    Only ACTIVE + APPROVED users are allowed to log in.
    """

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if user is None:
        return None

    # Account disabled
    if not user.is_active:
        return None

    # Account must be approved by an administrator
    if user.status != "APPROVED":
        return None

    # Verify password
    if not verify_password(
        password,
        user.hashed_password
    ):
        return None

    return user


# ============================================================
# CREATE ACCESS TOKEN
# ============================================================

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
):
    """
    Create a JWT access token.
    """

    to_encode = data.copy()

    if expires_delta:
        expire = (
            datetime.now(timezone.utc)
            + expires_delta
        )
    else:
        expire = (
            datetime.now(timezone.utc)
            + timedelta(
                minutes=ACCESS_TOKEN_EXPIRE_MINUTES
            )
        )

    to_encode.update(
        {
            "exp": expire
        }
    )

    encoded_jwt = jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return encoded_jwt


# ============================================================
# GET CURRENT USER
# ============================================================

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Validate JWT token and return the current user.

    The account must remain:
        - active
        - approved
    """

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={
            "WWW-Authenticate": "Bearer"
        },
    )

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        email = payload.get("sub")

        if email is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if user is None:
        raise credentials_exception

    # Disabled account
    if not user.is_active:
        raise credentials_exception

    # Pending / rejected / suspended account
    if user.status != "APPROVED":
        raise credentials_exception

    return user


# ============================================================
# ADMIN AUTHORIZATION
# ============================================================

def get_current_admin(
    current_user: User = Depends(get_current_user)
):
    """
    Allow access only to approved administrator accounts.
    """

    if current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required"
        )

    return current_user