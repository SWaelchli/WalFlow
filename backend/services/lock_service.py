import os
import json
import asyncio
import time
from typing import Optional, Dict, Set, Any
from datetime import datetime, timezone, timedelta

try:
    import redis
except ImportError:
    redis = None

# Redis Connection setup
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
redis_client = None
if redis:
    try:
        redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        print("Redis connected successfully for lock management.")
    except Exception as e:
        print(f"Redis connection failed ({e}). Falling back to local in-memory lock store.")
        redis_client = None


# Local Fallback Lock Store: diagram_id -> lock details dict
LOCAL_LOCKS: Dict[str, dict] = {}


def _prune_expired_local_locks(now: datetime):
    """Evicts expired lock records from LOCAL_LOCKS memory store."""
    expired_keys = []
    for diag_id, data in list(LOCAL_LOCKS.items()):
        try:
            exp_time = datetime.fromisoformat(data["expires_at"])
            if exp_time <= now:
                expired_keys.append(diag_id)
        except Exception:
            expired_keys.append(diag_id)
    for diag_id in expired_keys:
        LOCAL_LOCKS.pop(diag_id, None)


def collab_broadcast_interval_s() -> float:
    """WALFLOW_COLLAB_BROADCAST_INTERVAL_S: shortest gap between 'diagram updated' notices per diagram (F2-11)."""
    try:
        return max(0.0, float(os.getenv("WALFLOW_COLLAB_BROADCAST_INTERVAL_S", "10")))
    except ValueError:
        return 10.0


class ConnectionManager:
    """Manages WebSocket connections and room broadcasting per diagram."""
    def __init__(self):
        self.active_connections: Dict[str, Set] = {}  # diagram_id -> set of websockets
        self.websocket_diagrams: Dict[Any, str] = {}  # websocket -> diagram_id
        self.websocket_users: Dict[Any, str] = {}  # websocket -> user_id (set when it joined)
        self._last_update_sent: Dict[str, float] = {}  # diagram_id -> monotonic time of last notice
        self._pending_update: Dict[str, dict] = {}  # diagram_id -> latest notice waiting for the interval to pass

    async def connect(self, websocket, diagram_id: str, user_id: Optional[str] = None):
        if diagram_id:
            # Clean up previous diagram association if client is switching rooms
            old_diagram_id = self.websocket_diagrams.get(websocket)
            if old_diagram_id and old_diagram_id != diagram_id:
                if old_diagram_id in self.active_connections:
                    self.active_connections[old_diagram_id].discard(websocket)
                    if not self.active_connections[old_diagram_id]:
                        del self.active_connections[old_diagram_id]

            if diagram_id not in self.active_connections:
                self.active_connections[diagram_id] = set()
            self.active_connections[diagram_id].add(websocket)
            self.websocket_diagrams[websocket] = diagram_id
            if user_id:
                self.websocket_users[websocket] = user_id

    def disconnect(self, websocket):
        """Forget a socket. Returns (diagram_id, user_id) it was joined with, or None."""
        diagram_id = self.websocket_diagrams.pop(websocket, None)
        user_id = self.websocket_users.pop(websocket, None)
        if diagram_id and diagram_id in self.active_connections:
            self.active_connections[diagram_id].discard(websocket)
            if not self.active_connections[diagram_id]:
                del self.active_connections[diagram_id]
        return (diagram_id, user_id) if diagram_id else None

    def user_has_connection(self, diagram_id: str, user_id: str) -> bool:
        return any(self.websocket_users.get(c) == user_id for c in self.active_connections.get(diagram_id, ()))

    async def broadcast_to_diagram(self, diagram_id: str, message: dict, exclude_websocket=None):
        if not diagram_id or diagram_id not in self.active_connections:
            return

        targets = [
            conn for conn in list(self.active_connections[diagram_id])
            if conn != exclude_websocket
        ]
        if not targets:
            return

        payload = json.dumps(message)
        tasks = [conn.send_text(payload) for conn in targets]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for conn, result in zip(targets, results):
            if isinstance(result, Exception):
                self.disconnect(conn)

    async def notify_diagram_updated(self, diagram_id: str, message: dict):
        """Send 'diagram_updated' at most once per interval per diagram; a notice that arrives sooner is
        held back and the newest one is sent when the interval has passed (F2-11)."""
        interval = collab_broadcast_interval_s()
        now = time.monotonic()
        wait = self._last_update_sent.get(diagram_id, -1e9) + interval - now
        if wait <= 0:
            self._last_update_sent[diagram_id] = now
            await self.broadcast_to_diagram(diagram_id, message)
            return
        already_waiting = diagram_id in self._pending_update
        self._pending_update[diagram_id] = message
        if already_waiting:
            return

        async def _send_later():
            await asyncio.sleep(wait)
            latest = self._pending_update.pop(diagram_id, None)
            if latest is not None:
                self._last_update_sent[diagram_id] = time.monotonic()
                await self.broadcast_to_diagram(diagram_id, latest)

        task = asyncio.create_task(_send_later())
        self._background = getattr(self, "_background", set())
        self._background.add(task)
        task.add_done_callback(self._background.discard)


async def release_lock_after_disconnect(manager: "ConnectionManager", info):
    """F2-25: free the edit lock when the last socket of the lock holder closes (tab closed, network lost)."""
    if not info:
        return
    diagram_id, user_id = info
    if not user_id or manager.user_has_connection(diagram_id, user_id):
        return
    lock = get_lock_status_info(diagram_id)
    if lock and lock.get("user_id") == user_id and release_lock(diagram_id, user_id):
        await manager.broadcast_to_diagram(diagram_id, {
            "action": "lock_released",
            "diagram_id": diagram_id,
            "user_id": user_id,
            "username": lock.get("username"),
        })


collab_manager = ConnectionManager()


# Replaces the lock value only if it still equals the value that was read (ARGV[1])
_CAS_SET_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
    return 1
end
return 0
"""


def acquire_lock(diagram_id: str, user_id: str, username: str, expire_seconds: int = 900) -> dict:
    """Acquires or refreshes an editing lock on a diagram."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=expire_seconds)
    lock_data = {
        "user_id": user_id,
        "username": username,
        "locked_at": now.isoformat(),
        "expires_at": expires_at.isoformat()
    }
    
    if redis_client:
        try:
            key = f"walflow:lock:{diagram_id}"
            payload = json.dumps(lock_data)
            # Atomic: SET NX claims a free key; replacing a held key is a compare-and-swap on the value we read
            for _ in range(3):
                if redis_client.set(key, payload, nx=True, ex=expire_seconds):
                    return lock_data
                existing_raw = redis_client.get(key)
                if existing_raw is None:
                    continue
                existing = json.loads(existing_raw)
                existing_expires = datetime.fromisoformat(existing["expires_at"])
                if existing["user_id"] != user_id and existing_expires > now:
                    return existing
                if redis_client.eval(_CAS_SET_LUA, 1, key, existing_raw, payload, expire_seconds):
                    return lock_data
            existing_raw = redis_client.get(key)
            if existing_raw:
                return json.loads(existing_raw)
            redis_client.set(key, payload, ex=expire_seconds)
            return lock_data
        except Exception:
            pass

    # Local fallback
    _prune_expired_local_locks(now)
    existing = LOCAL_LOCKS.get(diagram_id)
    if existing:
        existing_expires = datetime.fromisoformat(existing["expires_at"])
        if existing["user_id"] != user_id and existing_expires > now:
            return existing

    LOCAL_LOCKS[diagram_id] = lock_data
    return lock_data


def release_lock(diagram_id: str, user_id: str, force: bool = False) -> bool:
    """Releases a diagram lock held by user_id, or unconditionally if force is True."""
    now = datetime.now(timezone.utc)
    if redis_client:
        try:
            key = f"walflow:lock:{diagram_id}"
            existing_raw = redis_client.get(key)
            if not existing_raw:
                return True
            existing = json.loads(existing_raw)
            existing_expires = datetime.fromisoformat(existing["expires_at"])
            if existing_expires <= now:
                redis_client.delete(key)
                return True
            if not force and existing["user_id"] != user_id:
                return False
            redis_client.delete(key)
            return True
        except Exception:
            pass

    # Local fallback
    _prune_expired_local_locks(now)
    existing = LOCAL_LOCKS.get(diagram_id)
    if not existing:
        return True
    existing_expires = datetime.fromisoformat(existing["expires_at"])
    if existing_expires <= now:
        LOCAL_LOCKS.pop(diagram_id, None)
        return True
    if not force and existing["user_id"] != user_id:
        return False
    LOCAL_LOCKS.pop(diagram_id, None)
    return True


def get_lock_status_info(diagram_id: str) -> Optional[dict]:
    """Retrieves active lock info for diagram_id, or None if unlocked or expired."""
    now = datetime.now(timezone.utc)
    if redis_client:
        try:
            key = f"walflow:lock:{diagram_id}"
            existing_raw = redis_client.get(key)
            if existing_raw:
                existing = json.loads(existing_raw)
                existing_expires = datetime.fromisoformat(existing["expires_at"])
                if existing_expires > now:
                    delta = (existing_expires - now).total_seconds()
                    existing["time_remaining"] = max(0, int(delta))
                    return existing
                else:
                    redis_client.delete(key)
        except Exception:
            pass

    # Local fallback
    _prune_expired_local_locks(now)
    existing = LOCAL_LOCKS.get(diagram_id)
    if existing:
        existing_expires = datetime.fromisoformat(existing["expires_at"])
        if existing_expires > now:
            delta = (existing_expires - now).total_seconds()
            existing["time_remaining"] = max(0, int(delta))
            return existing
        else:
            LOCAL_LOCKS.pop(diagram_id, None)
    return None
