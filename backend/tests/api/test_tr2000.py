"""Code-review fixes: TR2000 request paths are validated, upstream errors are not echoed to the client."""
import pytest

pytestmark = pytest.mark.audit("review-4")

import uuid

import pytest

from fastapi.testclient import TestClient

from main import app
from db.database import init_db, SessionLocal
from db.models import User
from auth import hash_password, create_access_token
from services import tr2000_service
from services.tr2000_service import _safe_segment


@pytest.mark.parametrize("value", ["AC140", "BSV1R-2", "1.0", "A B"])
def test_safe_segment_accepts_real_codes(value):
    assert _safe_segment(value, "x")


@pytest.mark.parametrize("value", ["../x", "a/b", "a?b", "..", ".", "", "a#b", "x" * 65])
def test_safe_segment_rejects_path_tricks(value):
    with pytest.raises(ValueError):
        _safe_segment(value, "x")


def test_sync_rejects_bad_code_and_hides_upstream_errors(monkeypatch):
    init_db()
    db = SessionLocal()
    u = User(username=f"pm_{uuid.uuid4().hex[:8]}", password_hash=hash_password("secret_pass_1"), role="pipe_manager", status="approved")
    db.add(u)
    db.commit()
    headers = {"Authorization": "Bearer " + create_access_token(data={"sub": u.id, "username": u.username, "role": u.role})}
    db.close()
    client = TestClient(app)
    body = {"pcs_code": "../admin", "agreed_to_terms": True}
    assert client.post("/api/pipe-classes/tr2000/sync", json=body, headers=headers).status_code == 400

    async def boom(path, client=None):
        raise RuntimeError("secret upstream detail 10.0.0.5")
    monkeypatch.setattr(tr2000_service, "_fetch_get", boom)
    r = client.post("/api/pipe-classes/tr2000/sync", json={"pcs_code": "AC140", "agreed_to_terms": True}, headers=headers)
    assert r.status_code == 502 and "10.0.0.5" not in r.text
