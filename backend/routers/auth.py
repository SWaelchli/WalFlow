from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User
from auth import hash_password, verify_password, create_access_token, get_current_user

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

@router.get("/admin-status")
def get_admin_status(db: Session = Depends(get_db)):
    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    pending_count = db.query(User).filter(User.status == "pending_approval").count()
    return {
        "admin_exists": admin_exists,
        "pending_count": pending_count
    }

@router.post("/setup-admin", response_model=UserResponseSchema, status_code=status.HTTP_201_CREATED)
def setup_first_admin(payload: UserRegisterSchema, db: Session = Depends(get_db)):
    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    if admin_exists:
        raise HTTPException(status_code=400, detail="An administrator account already exists.")

    clean_username = payload.username.strip()
    if len(clean_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(payload.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")

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
def register_user(payload: UserRegisterSchema, db: Session = Depends(get_db)):
    clean_username = payload.username.strip()
    if len(clean_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(payload.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")

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
def login_user(payload: UserLoginSchema, response: Response, db: Session = Depends(get_db)):
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

    import os
    secure_cookie_env = os.getenv("WALFLOW_SECURE_COOKIES")
    if secure_cookie_env is not None:
        is_secure_cookie = secure_cookie_env.lower() in ("true", "1")
    else:
        # Default to false in local development (if no secret key is set), otherwise true for safety
        is_secure_cookie = os.getenv("WALFLOW_SECRET_KEY") is not None

    # Set HttpOnly cookie for browser security
    response.set_cookie(
        key="walflow_auth_token",
        value=token,
        httponly=True,
        secure=is_secure_cookie,
        samesite="lax",
        max_age=60 * 60 * 24 * 7
    )

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

@router.post("/logout")
def logout_user(response: Response):
    response.delete_cookie("walflow_auth_token")
    return {"status": "success", "message": "Logged out successfully."}

@router.get("/me", response_model=UserResponseSchema)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user
