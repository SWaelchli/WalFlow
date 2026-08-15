import os
import sys
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

def get_client_ip(request: Request) -> str:
    # Check X-Forwarded-For header if behind a reverse proxy (e.g. Nginx, Docker)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request) or "127.0.0.1"

def is_rate_limiting_enabled() -> bool:
    if os.getenv("TESTING") == "1":
        return False
    # Check if run by pytest or unittest runner
    if any("pytest" in arg or "unittest" in arg for arg in sys.argv):
        return False
    explicit = os.getenv("WALFLOW_RATE_LIMIT_ENABLED")
    if explicit is not None:
        return explicit.lower() in ("true", "1")
    return True

# Shared limiter instance with reasonable default limits
limiter = Limiter(key_func=get_client_ip, enabled=is_rate_limiting_enabled(), default_limits=["300/minute"])
