"""Code-review fixes: library imports tolerate duplicates and bad entries."""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("DATABASE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_b3.db"))

from fastapi.testclient import TestClient

from main import app
from db.database import init_db, SessionLocal
from db.models import User, PipeClass
from auth import hash_password, create_access_token


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


@pytest.fixture(scope="module")
def manager():
    db = SessionLocal()
    try:
        u = User(username=f"pm_{uuid.uuid4().hex[:8]}", password_hash=hash_password("secret_pass_1"), role="pipe_manager", status="approved")
        db.add(u)
        db.commit()
        return {"Authorization": "Bearer " + create_access_token(data={"sub": u.id, "username": u.username, "role": u.role})}
    finally:
        db.close()


@pytest.fixture
def client():
    return TestClient(app)


def _size():
    return {"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 3.9, "sch": "STD"}


def test_pipe_class_import_survives_duplicates_and_bad_values(client, manager):
    code = f"DUP{uuid.uuid4().hex[:6]}".upper()
    good = {"code": code, "sizes": [_size()]}
    bad = {"code": f"BAD{uuid.uuid4().hex[:6]}".upper(), "sizes": [{"od_mm": "abc", "wt_mm": 1}]}
    r = client.post("/api/pipe-classes/import/library", json={"classes": [good, dict(good), bad]}, headers=manager)
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == [code]
    assert body["skipped_duplicates"] == [code]
    assert len(body["invalid_entries"]) == 1


def test_fitting_standard_import_survives_duplicate_codes(client, manager):
    code = f"FS{uuid.uuid4().hex[:6]}".upper()
    dims = [{"dn_large": 100, "dn_small": 50, "length_mm": 127}]
    entry = {"code": code, "name": "X", "fitting_type": "reducer", "dimensions": dims}
    r = client.post("/api/fitting-standards/import-library", json=[entry, dict(entry)], headers=manager)
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1 and r.json()["skipped"] == 1
