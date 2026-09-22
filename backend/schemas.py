from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    status: str
    role: str
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class Token(BaseModel):
    access_token: str
    token_type: str