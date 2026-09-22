from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from auth import (
   authenticate_user,
    create_access_token,
    get_current_admin,
    get_current_user,
    hash_password,
    verify_password,
)

from database import Base, engine, get_db
from models import User

from schemas import (
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
)


# ============================================================
# DATABASE
# ============================================================

Base.metadata.create_all(bind=engine)


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="DerivaSense AI API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],

    allow_credentials=True,

    allow_methods=[
        "*"
    ],

    allow_headers=[
        "*"
    ],
)


# ============================================================
# ROOT
# ============================================================

@app.get("/api/")
def root():

    return {
        "message": "DerivaSense AI API is running",
        "status": "ok",
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/api/health")
def health():

    return {
        "status": "healthy"
    }


# ============================================================
# REGISTER
# ============================================================

@app.post(
    "/api/auth/register",
    response_model=UserResponse,
)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db),
):

    existing_user = (
        db.query(User)
        .filter(
            User.email == user_data.email
        )
        .first()
    )

    if existing_user:

        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    # --------------------------------------------------------
    # ALL PUBLIC REGISTRATIONS START AS PENDING USERS
    # --------------------------------------------------------

    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=hash_password(
            user_data.password
        ),
        is_active=True,
        status="PENDING",
        role="USER",
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


# ============================================================
# LOGIN
# ============================================================

@app.post(
    "/api/auth/login",
    response_model=Token,
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # FIRST FIND THE USER
    # --------------------------------------------------------

    user = (
        db.query(User)
        .filter(
            User.email == form_data.username
        )
        .first()
    )

    # --------------------------------------------------------
    # USER DOES NOT EXIST
    # --------------------------------------------------------

    if user is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # --------------------------------------------------------
    # VERIFY PASSWORD
    # --------------------------------------------------------

    if not verify_password(
        form_data.password,
        user.hashed_password,
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # --------------------------------------------------------
    # ACCOUNT STATUS CHECK
    # --------------------------------------------------------

    if user.status == "PENDING":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is pending admin approval. "
                "Please wait until an administrator approves "
                "your registration."
            ),
        )

    if user.status == "REJECTED":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your registration has been rejected. "
                "Please contact the administrator."
            ),
        )

    if user.status == "SUSPENDED":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is suspended. "
                "Please contact the administrator."
            ),
        )

    # --------------------------------------------------------
    # ACCOUNT MUST BE ACTIVE
    # --------------------------------------------------------

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is inactive. "
                "Please contact the administrator."
            ),
        )

    # --------------------------------------------------------
    # ONLY APPROVED USERS CAN LOGIN
    # --------------------------------------------------------

    if user.status != "APPROVED":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is not approved for login."
            ),
        )

    # --------------------------------------------------------
    # CREATE JWT
    # --------------------------------------------------------

    access_token = create_access_token(
        data={
            "sub": user.email
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }

# ============================================================
# CURRENT USER
# ============================================================

@app.get(
    "/api/auth/me",
    response_model=UserResponse,
)
def get_me(
    current_user: User = Depends(
        get_current_user
    ),
):

    return current_user


# ============================================================
# ADMIN — LIST ALL USERS
# ============================================================

@app.get(
    "/api/admin/users",
    response_model=list[UserResponse],
)
def admin_list_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):

    users = (
        db.query(User)
        .order_by(User.created_at.desc())
        .all()
    )

    return users


# ============================================================
# ADMIN — APPROVE USER
# ============================================================

@app.patch(
    "/api/admin/users/{user_id}/approve",
    response_model=UserResponse,
)
def admin_approve_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    user.status = "APPROVED"
    user.is_active = True

    db.commit()
    db.refresh(user)

    return user


# ============================================================
# ADMIN — REJECT USER
# ============================================================

@app.patch(
    "/api/admin/users/{user_id}/reject",
    response_model=UserResponse,
)
def admin_reject_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Do not allow an administrator to reject themselves
    if user.id == current_admin.id:

        raise HTTPException(
            status_code=400,
            detail="You cannot reject your own administrator account",
        )

    user.status = "REJECTED"
    user.is_active = False

    db.commit()
    db.refresh(user)

    return user


# ============================================================
# ADMIN — SUSPEND USER
# ============================================================

@app.patch(
    "/api/admin/users/{user_id}/suspend",
    response_model=UserResponse,
)
def admin_suspend_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Do not allow an administrator to suspend themselves
    if user.id == current_admin.id:

        raise HTTPException(
            status_code=400,
            detail="You cannot suspend your own administrator account",
        )

    user.status = "SUSPENDED"
    user.is_active = False

    db.commit()
    db.refresh(user)

    return user


# ============================================================
# ADMIN — REACTIVATE USER
# ============================================================

@app.patch(
    "/api/admin/users/{user_id}/reactivate",
    response_model=UserResponse,
)
def admin_reactivate_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    user.status = "APPROVED"
    user.is_active = True

    db.commit()
    db.refresh(user)

    return user


# ============================================================
# ADMIN — DELETE USER
# ============================================================

@app.delete(
    "/api/admin/users/{user_id}",
)
def admin_delete_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Never allow the currently logged-in admin
    # to delete their own account.
    if user.id == current_admin.id:

        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own administrator account",
        )

    # Protect administrator accounts from accidental deletion.
    if user.role == "ADMIN":

        raise HTTPException(
            status_code=400,
            detail="Administrator accounts cannot be deleted",
        )

    deleted_email = user.email

    db.delete(user)
    db.commit()

    return {
        "message": "User deleted successfully",
        "id": user_id,
        "email": deleted_email,
    }