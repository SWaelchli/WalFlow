import os
import sys
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

def trusted_proxy_hops() -> int:
    """WALFLOW_TRUSTED_PROXY_HOPS: proxies in front of the backend that append to X-Forwarded-For.

    1 = the bundled nginx container (default); 2 = one more reverse proxy in front of it; 0 = ignore the header.
    """
    try:
        return max(0, int(os.getenv("WALFLOW_TRUSTED_PROXY_HOPS", "1")))
    except ValueError:
        return 1

def get_client_ip(request: Request) -> str:
    # F2-12: the left side of X-Forwarded-For is client-controlled; only entries appended by our own proxies
    # count, so take the address `hops` entries from the right (the peer the outermost trusted proxy saw).
    hops = trusted_proxy_hops()
    forwarded = request.headers.get("X-Forwarded-For")
    if hops and forwarded:
        entries = [e.strip() for e in forwarded.split(",") if e.strip()]
        if len(entries) >= hops:
            return entries[-hops]
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
