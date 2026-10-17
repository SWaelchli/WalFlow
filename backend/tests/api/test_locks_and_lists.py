"""Code-review fixes: atomic Redis lock acquisition, summary lists skip diagram blobs."""
import pytest

pytestmark = pytest.mark.audit("review-5")

import uuid

from sqlalchemy import event

from services import lock_service


class FakeRedis:
    """Just enough Redis for acquire_lock: SET NX, GET and the compare-and-swap script."""
    def __init__(self):
        self.data = {}
        self.calls = []

    def set(self, key, value, nx=False, ex=None):
        self.calls.append("set_nx" if nx else "set")
        if nx and key in self.data:
            return None
        self.data[key] = value
        return True

    def get(self, key):
        return self.data.get(key)

    def eval(self, script, numkeys, key, expected, new, ex):
        self.calls.append("eval")
        if self.data.get(key) == expected:
            self.data[key] = new
            return 1
        return 0


def test_redis_acquire_is_exclusive_and_refreshable(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(lock_service, "redis_client", fake)
    did = f"d_{uuid.uuid4().hex}"
    first = lock_service.acquire_lock(did, "u1", "alice")
    assert first["user_id"] == "u1"
    assert fake.calls[0] == "set_nx"
    assert lock_service.acquire_lock(did, "u2", "bob")["user_id"] == "u1"      # held by someone else
    refreshed = lock_service.acquire_lock(did, "u1", "alice")                  # same user refreshes
    assert refreshed["user_id"] == "u1" and "eval" in fake.calls


def test_diagram_list_does_not_load_diagram_data():
    from fastapi.testclient import TestClient
    from main import app
    from db.database import init_db, engine, SessionLocal
    from db.models import User, Diagram
    from auth import hash_password, create_access_token
    init_db()
    db = SessionLocal()
    u = User(username=f"l_{uuid.uuid4().hex[:8]}", password_hash=hash_password("secret_pass_1"), role="user", status="approved")
    db.add(u)
    db.commit()
    db.add(Diagram(user_id=u.id, title="D", diagram_data="X" * 1000))
    db.commit()
    headers = {"Authorization": "Bearer " + create_access_token(data={"sub": u.id, "username": u.username, "role": u.role})}
    db.close()

    selects = []

    @event.listens_for(engine, "before_cursor_execute")
    def _capture(conn, cursor, statement, *a):
        selects.append(statement)

    try:
        r = TestClient(app).get("/api/diagrams", headers=headers)
    finally:
        event.remove(engine, "before_cursor_execute", _capture)
    assert r.status_code == 200 and len(r.json()) == 1
    assert not any("diagrams.diagram_data" in q and "FROM diagrams" in q for q in selects)
