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
# One lock per user: user_id -> diagram ids the user holds a lock on (local store; Redis keeps its own index).
# Checkout acquires the new lock first, then releases the others found here.
LOCAL_USER_LOCKS: Dict[str, Set[str]] = {}


def lock_lease_s() -> int:
    """WALFLOW_LOCK_LEASE_S: a lock expires this long after its last checkout, heartbeat or save. At least
    120 s, two client heartbeats (60 s apart), so an open tab never loses its lock between heartbeats."""
    try:
        return max(120, int(os.getenv("WALFLOW_LOCK_LEASE_S", "180")))
    except ValueError:
        return 180


def lock_disconnect_grace_s() -> float:
    """WALFLOW_LOCK_DISCONNECT_GRACE_S: how long a lock survives a dropped connection before it is released."""
    try:
        return max(0.0, float(os.getenv("WALFLOW_LOCK_DISCONNECT_GRACE_S", "60")))
    except ValueError:
        return 60.0


def is_lock_holder(lock: Optional[dict], user_id: str, session_id: Optional[str] = None) -> bool:
    """True when the lock belongs to this user and this tab. A lock or request without a tab id matches
    any tab of the user (older clients, API calls)."""
    if not lock or lock.get("user_id") != user_id:
        return False
    held_session = lock.get("session_id")
    return not held_session or not session_id or held_session == session_id


def _user_index_key(user_id: str) -> str:
    return f"walflow:userlock:{user_id}"


def _set_user_index(user_id: str, diagram_id: str, expire_seconds: int):
    if redis_client:
        try:
            key = _user_index_key(user_id)
            redis_client.sadd(key, diagram_id)
            redis_client.expire(key, expire_seconds)
            return
        except Exception:
            pass
    LOCAL_USER_LOCKS.setdefault(user_id, set()).add(diagram_id)


def _clear_user_index(user_id: str, diagram_id: str):
    if redis_client:
        try:
            redis_client.srem(_user_index_key(user_id), diagram_id)
            return
        except Exception:
            pass
    held = LOCAL_USER_LOCKS.get(user_id)
    if held is not None:
        held.discard(diagram_id)
        if not held:
            LOCAL_USER_LOCKS.pop(user_id, None)


def locked_diagrams_of_user(user_id: str) -> Set[str]:
    """The diagrams this user may hold a lock on (stale entries are dropped by the caller)."""
    if redis_client:
        try:
            return set(redis_client.smembers(_user_index_key(user_id)))
        except Exception:
            pass
    return set(LOCAL_USER_LOCKS.get(user_id, ()))


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
    """WALFLOW_COLLAB_BROADCAST_INTERVAL_S: shortest gap between 'diagram updated' notices per diagram."""
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
        self.websocket_sessions: Dict[Any, str] = {}  # websocket -> tab id sent with the join
        self._last_update_sent: Dict[str, float] = {}  # diagram_id -> monotonic time of last notice
        self._pending_update: Dict[str, dict] = {}  # diagram_id -> latest notice waiting for the interval to pass
        self._background: Set[asyncio.Task] = set()  # running tasks, kept so they are not garbage-collected

    def _spawn(self, coro):
        task = asyncio.create_task(coro)
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    def schedule_disconnect_release(self, info):
        """Release the edit lock of a socket that went away, after the disconnect grace."""
        if info:
            self._spawn(release_lock_after_disconnect(self, info, lock_disconnect_grace_s()))

    async def connect(self, websocket, diagram_id: str, user_id: Optional[str] = None, session_id: Optional[str] = None):
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
            if session_id:
                self.websocket_sessions[websocket] = session_id

    def disconnect(self, websocket):
        """Forget a socket. Returns (diagram_id, user_id, session_id) it was joined with, or None."""
        diagram_id = self.websocket_diagrams.pop(websocket, None)
        user_id = self.websocket_users.pop(websocket, None)
        session_id = self.websocket_sessions.pop(websocket, None)
        if diagram_id and diagram_id in self.active_connections:
            self.active_connections[diagram_id].discard(websocket)
            if not self.active_connections[diagram_id]:
                del self.active_connections[diagram_id]
        return (diagram_id, user_id, session_id) if diagram_id else None

    def user_has_connection(self, diagram_id: str, user_id: str, session_id: Optional[str] = None) -> bool:
        """True when this user (and, given a tab id, this tab) still has a socket joined to the diagram."""
        return any(
            self.websocket_users.get(c) == user_id
            and (not session_id or self.websocket_sessions.get(c) in (None, session_id))
            for c in self.active_connections.get(diagram_id, ())
        )

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
                # A dead socket gives its lock back after the same grace as a normal disconnect
                self.schedule_disconnect_release(self.disconnect(conn))

    async def notify_diagram_updated(self, diagram_id: str, message: dict):
        """Send 'diagram_updated' at most once per interval per diagram; a notice that arrives sooner is
        held back and the newest one is sent when the interval has passed."""
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

        self._spawn(_send_later())


def lock_released_message(diagram_id: str, lock: dict, reason: str) -> dict:
    """'lock_released' event for a holder's own release: moved, checked_in or disconnected."""
    return {
        "action": "lock_released",
        "diagram_id": diagram_id,
        "user_id": lock.get("user_id"),
        "username": lock.get("username"),
        "session_id": lock.get("session_id"),
        "reason": reason,
    }


async def release_lock_after_disconnect(manager: "ConnectionManager", info, grace_s: float = 0.0):
    """Free the edit lock when the holder's tab has had no socket on the diagram for grace_s seconds (tab
    closed, network lost). A tab that reconnects within the grace keeps its lock."""
    if not info:
        return
    diagram_id, user_id, session_id = (tuple(info) + (None,))[:3]
    if not user_id:
        return
    if grace_s > 0:
        await asyncio.sleep(grace_s)
    if manager.user_has_connection(diagram_id, user_id, session_id):
        return
    lock = get_lock_status_info(diagram_id)
    # Only the tab that holds the lock gives it back; a socket without a tab id cannot release another tab's lock
    holds_it = lock and lock.get("user_id") == user_id and lock.get("session_id") == session_id
    if holds_it and release_lock(diagram_id, user_id, session_id=session_id):
        await manager.broadcast_to_diagram(diagram_id, lock_released_message(diagram_id, lock, "disconnected"))


collab_manager = ConnectionManager()


# Replaces the lock value only if it still equals the value that was read (ARGV[1])
_CAS_SET_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
    return 1
end
return 0
"""


def acquire_lock(diagram_id: str, user_id: str, username: str, expire_seconds: Optional[int] = None,
                 session_id: Optional[str] = None) -> dict:
    """Acquires or refreshes an editing lock on a diagram for one tab (session_id) of a user. Returns the
    caller's lock, or the lock that blocks it: another user's, or this user's from another tab."""
    if expire_seconds is None:
        expire_seconds = lock_lease_s()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=expire_seconds)
    lock_data = {
        "user_id": user_id,
        "username": username,
        "session_id": session_id,
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
                    _set_user_index(user_id, diagram_id, expire_seconds)
                    return lock_data
                existing_raw = redis_client.get(key)
                if existing_raw is None:
                    continue
                existing = json.loads(existing_raw)
                existing_expires = datetime.fromisoformat(existing["expires_at"])
                if existing_expires > now:
                    if not is_lock_holder(existing, user_id, session_id):
                        return existing
                    lock_data["locked_at"] = existing.get("locked_at", lock_data["locked_at"])
                    lock_data["session_id"] = session_id or existing.get("session_id")
                    payload = json.dumps(lock_data)
                if redis_client.eval(_CAS_SET_LUA, 1, key, existing_raw, payload, expire_seconds):
                    _set_user_index(user_id, diagram_id, expire_seconds)
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
        if not is_lock_holder(existing, user_id, session_id):
            return existing
        lock_data["locked_at"] = existing.get("locked_at", lock_data["locked_at"])
        lock_data["session_id"] = session_id or existing.get("session_id")

    LOCAL_LOCKS[diagram_id] = lock_data
    _set_user_index(user_id, diagram_id, expire_seconds)
    return lock_data


def user_holds_other_lock(user_id: str, diagram_id: str) -> bool:
    """True when this user holds a live lock on a diagram other than diagram_id."""
    return any(
        (lock := get_lock_status_info(other_id)) and lock.get("user_id") == user_id
        for other_id in locked_diagrams_of_user(user_id) - {diagram_id}
    )


def release_other_locks_of_user(user_id: str, keep_diagram_id: str) -> list:
    """One lock per user: release the lock this user holds on any other diagram. Returns the released
    locks as (diagram_id, lock) pairs, so callers can tell the viewers of those diagrams."""
    released = []
    for other_id in locked_diagrams_of_user(user_id) - {keep_diagram_id}:
        lock = get_lock_status_info(other_id)
        if lock and lock.get("user_id") == user_id and release_lock(other_id, user_id):
            released.append((other_id, lock))
        else:
            _clear_user_index(user_id, other_id)
    return released


def release_lock(diagram_id: str, user_id: str, force: bool = False, session_id: Optional[str] = None) -> bool:
    """Releases a diagram lock held by user_id (and, given a tab id, by that tab), or unconditionally if
    force is True. Returns False when someone else holds it."""
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
            if not force and not is_lock_holder(existing, user_id, session_id):
                return False
            redis_client.delete(key)
            _clear_user_index(existing["user_id"], diagram_id)
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
    if not force and not is_lock_holder(existing, user_id, session_id):
        return False
    LOCAL_LOCKS.pop(diagram_id, None)
    _clear_user_index(existing["user_id"], diagram_id)
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
