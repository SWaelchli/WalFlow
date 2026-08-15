import os
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User
from auth import hash_password, verify_password, create_access_token, decode_access_token, get_current_user, revoke_token
from limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["authentication"])

class UserRegisterSchema(BaseModel):
    username: str
    password: str

class UserLoginSchema(BaseModel):
    username: str
    password: str

class UserResponseSchema(BaseModel):
    id: str
    username: str
    role: str
    status: str

    class Config:
        from_attributes = True

def _set_auth_cookie(response: Response, token: str):
    secure_cookie_env = os.getenv("WALFLOW_SECURE_COOKIES")
    if secure_cookie_env is not None:
        is_secure_cookie = secure_cookie_env.lower() in ("true", "1")
    else:
        # Default to false in local development (if no secret key is set), otherwise true for safety
        is_secure_cookie = os.getenv("WALFLOW_SECRET_KEY") is not None

    # Set HttpOnly cookie for 60 minutes
    response.set_cookie(
        key="walflow_auth_token",
        value=token,
        httponly=True,
        secure=is_secure_cookie,
        samesite="lax",
        max_age=60 * 60  # 60 minutes (3600 seconds)
    )

@router.get("/admin-status")
def get_admin_status(db: Session = Depends(get_db)):
    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    pending_count = db.query(User).filter(User.status == "pending_approval").count()
    return {
        "admin_exists": admin_exists,
        "pending_count": pending_count
    }

@router.post("/setup-admin", response_model=UserResponseSchema, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def setup_first_admin(request: Request, payload: UserRegisterSchema, db: Session = Depends(get_db)):
    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    if admin_exists:
        raise HTTPException(status_code=400, detail="An administrator account already exists.")

    clean_username = payload.username.strip()
    if len(clean_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    existing_user = db.query(User).filter(User.username == clean_username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists.")

    admin_user = User(
        username=clean_username,
        password_hash=hash_password(payload.password),
        role="admin",
        status="approved"
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)
    return admin_user

@router.post("/register", response_model=UserResponseSchema, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register_user(request: Request, payload: UserRegisterSchema, db: Session = Depends(get_db)):
    clean_username = payload.username.strip()
    if len(clean_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    existing_user = db.query(User).filter(User.username == clean_username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists.")

    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    
    # If no admin exists yet, make this user the admin & approve. Otherwise, user is pending approval.
    initial_role = "admin" if not admin_exists else "user"
    initial_status = "approved" if not admin_exists else "pending_approval"

    new_user = User(
        username=clean_username,
        password_hash=hash_password(payload.password),
        role=initial_role,
        status=initial_status
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login")
@limiter.limit("10/minute")
def login_user(request: Request, payload: UserLoginSchema, response: Response, db: Session = Depends(get_db)):
    clean_username = payload.username.strip()
    user = db.query(User).filter(User.username == clean_username).first()
    
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    if user.status == "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account registration is pending administrator approval."
        )
    elif user.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account registration was rejected by an administrator."
        )

    token = create_access_token(data={"sub": user.id, "username": user.username, "role": user.role})
    _set_auth_cookie(response, token)

    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "status": user.status
        }
    }

@router.post("/refresh")
def refresh_token(request: Request, response: Response, current_user: User = Depends(get_current_user)):
    """Sliding session renewal: reissues a fresh 60-minute token for active sessions."""
    # Revoke current old token
    old_token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        old_token = auth_header.split(" ")[1]
    if not old_token:
        old_token = request.cookies.get("walflow_auth_token")
    if old_token:
        revoke_token(old_token)

    new_token = create_access_token(data={"sub": current_user.id, "username": current_user.username, "role": current_user.role})
    _set_auth_cookie(response, new_token)

    return {
        "status": "success",
        "access_token": new_token,
        "token_type": "bearer",
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "role": current_user.role,
            "status": current_user.status
        }
    }

@router.post("/logout")
def logout_user(request: Request, response: Response):
    # Extract token from Authorization header or cookie and blacklist it (SEC-03)
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    if not token:
        token = request.cookies.get("walflow_auth_token")

    if token:
        revoke_token(token)

    response.delete_cookie("walflow_auth_token")
    return {"status": "success", "message": "Logged out successfully."}

@router.get("/me", response_model=UserResponseSchema)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user
