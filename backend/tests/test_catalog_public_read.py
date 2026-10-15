"""Pipe class and fitting standard catalogs: anonymous read, restricted write."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("DATABASE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_b3.db"))

from fastapi.testclient import TestClient

from main import app
from db.database import init_db


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.parametrize("path", ["/api/pipe-classes", "/api/fitting-standards"])
def test_anonymous_can_list_catalogs(client, path):
    r = client.get(path)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_anonymous_can_read_one_pipe_class(client):
    items = client.get("/api/pipe-classes").json()
    if not items:
        pytest.skip("no pipe classes seeded")
    assert client.get(f"/api/pipe-classes/{items[0]['id']}").status_code == 200


def test_anonymous_can_read_one_fitting_standard(client):
    items = client.get("/api/fitting-standards").json()
    if not items:
        pytest.skip("no fitting standards seeded")
    assert client.get(f"/api/fitting-standards/{items[0]['code']}").status_code == 200


@pytest.mark.parametrize("method,path", [
    ("post", "/api/pipe-classes"),
    ("put", "/api/pipe-classes/x"),
    ("delete", "/api/pipe-classes/x"),
    ("post", "/api/pipe-classes/import/library"),
    ("post", "/api/pipe-classes/seed-examples"),
    ("post", "/api/fitting-standards"),
    ("put", "/api/fitting-standards/x"),
    ("delete", "/api/fitting-standards/x"),
    ("post", "/api/fitting-standards/import-library"),
    ("post", "/api/fitting-standards/seed-defaults"),
])
def test_anonymous_cannot_write(client, method, path):
    r = client.request(method.upper(), path, json={})
    assert r.status_code in (401, 403)
