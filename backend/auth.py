import os
import time
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User

SECRET_KEY = os.getenv("WALFLOW_SECRET_KEY")
if not SECRET_KEY:
    if os.getenv("ENVIRONMENT") == "production":
        raise ValueError("CRITICAL SECURITY ERROR: WALFLOW_SECRET_KEY environment variable is not set in production environment!")
    import logging
    logger = logging.getLogger("uvicorn")
    logger.warning("WARNING: WALFLOW_SECRET_KEY environment variable is not set. Falling back to an auto-generated random secret key for development.")
    SECRET_KEY = secrets.token_hex(32)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # Reduced to 60 minutes for security (SEC-03 / SEC-04)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Token Revocation Store (SEC-03)
# Supports Redis if configured, falls back to in-memory TTL dictionary with automatic cleanup
class TokenRevocationBlacklist:
    def __init__(self):
        self._memory_blacklist = {}  # {token_hash: expiry_timestamp}
        self._redis_client = None
        redis_url = os.getenv("WALFLOW_REDIS_URL") or os.getenv("REDIS_URL")
        if redis_url:
            try:
                import redis
                self._redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
                self._redis_client.ping()
            except Exception as e:
                import logging
                logging.getLogger("uvicorn").warning(f"Redis connection failed ({e}), falling back to in-memory JWT blacklist.")
                self._redis_client = None

    def _hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _cleanup_memory(self):
        now = time.time()
        expired_keys = [k for k, exp in self._memory_blacklist.items() if exp < now]
        for k in expired_keys:
            self._memory_blacklist.pop(k, None)

    def revoke(self, token: str, expires_in_seconds: int = None):
        """Add a token to the blacklist until its expiration."""
        if not token:
            return
        if expires_in_seconds is None:
            expires_in_seconds = ACCESS_TOKEN_EXPIRE_MINUTES * 60

        token_hash = self._hash_token(token)
        now = time.time()
        expiry = now + max(1, expires_in_seconds)

        if self._redis_client:
            try:
                self._redis_client.setex(f"walflow:revoked:{token_hash}", int(expires_in_seconds), "1")
                return
            except Exception:
                pass

        self._cleanup_memory()
        self._memory_blacklist[token_hash] = expiry

    def is_revoked(self, token: str) -> bool:
        """Check if a token has been revoked."""
        if not token:
            return False
        token_hash = self._hash_token(token)

        if self._redis_client:
            try:
                if self._redis_client.exists(f"walflow:revoked:{token_hash}"):
                    return True
            except Exception:
                pass

        self._cleanup_memory()
        expiry = self._memory_blacklist.get(token_hash)
        if expiry and expiry > time.time():
            return True
        return False

token_blacklist = TokenRevocationBlacklist()

def revoke_token(token: str, expires_in_seconds: int = None):
    token_blacklist.revoke(token, expires_in_seconds)

def is_token_revoked(token: str) -> bool:
    return token_blacklist.is_revoked(token)

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${hash_bytes.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        salt, expected_hash = hashed_password.split("$")
        hash_bytes = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return secrets.compare_digest(hash_bytes.hex(), expected_hash)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "jti": secrets.token_hex(16)
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str, check_revocation: bool = True) -> dict:
    if not token:
        return None
    if check_revocation and is_token_revoked(token):
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

def get_current_user(
    request: Request,
    token_from_header: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    # Try token from Authorization header or HttpOnly cookie
    token = token_from_header or request.cookies.get("walflow_auth_token")
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or revoked token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    return user

def get_current_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Administrator privileges required.",
        )
    return current_user

def get_current_pipe_manager_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if current_user.role not in ("admin", "pipe_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Administrator or Pipe Manager privileges required.",
        )
    return current_user
