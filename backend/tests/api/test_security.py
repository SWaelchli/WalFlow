"""Security and deployment behaviour."""
import pytest


import asyncio
import json
import uuid

import pytest

from fastapi.testclient import TestClient
from starlette.requests import Request

from physics_refs import solve
from main import app
from db.database import init_db, SessionLocal
from db.models import User
from auth import hash_password, create_access_token
from limiter import get_client_ip
from services.lock_service import ConnectionManager, release_lock_after_disconnect, get_lock_status_info
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.limits import SolveTimeout, solve_deadline, check_deadline


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


@pytest.fixture
def client():
    return TestClient(app)


def _user(role="user", status="approved"):
    db = SessionLocal()
    try:
        u = User(username=f"u_{uuid.uuid4().hex[:10]}", password_hash=hash_password("secret_pass_1"), role=role, status=status)
        db.add(u)
        db.commit()
        db.refresh(u)
        token = create_access_token(data={"sub": u.id, "username": u.username, "role": u.role})
        return u.id, {"Authorization": f"Bearer {token}"}, token
    finally:
        db.close()


def _drop_other_admins(keep_id):
    db = SessionLocal()
    try:
        db.query(User).filter(User.role == "admin", User.id != keep_id).update({"role": "user"})
        db.commit()
    finally:
        db.close()


def _request(xff=None, peer="10.0.0.9"):
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234), "method": "GET", "path": "/", "query_string": b""})


# ---------------------------------------------------------------- proxy headers
def test_spoofed_left_entry_is_ignored(monkeypatch):
    monkeypatch.delenv("WALFLOW_TRUSTED_PROXY_HOPS", raising=False)
    # the client sent "1.1.1.1"; nginx appended the real peer
    assert get_client_ip(_request("1.1.1.1, 203.0.113.7")) == "203.0.113.7"
    assert get_client_ip(_request("2.2.2.2, 203.0.113.7")) == "203.0.113.7"


def test_hops_and_fallbacks(monkeypatch):
    monkeypatch.setenv("WALFLOW_TRUSTED_PROXY_HOPS", "2")
    assert get_client_ip(_request("9.9.9.9, 203.0.113.7, 172.18.0.2")) == "203.0.113.7"
    assert get_client_ip(_request("172.18.0.2")) == "10.0.0.9"          # fewer entries than hops: socket peer
    monkeypatch.setenv("WALFLOW_TRUSTED_PROXY_HOPS", "0")
    assert get_client_ip(_request("1.1.1.1, 2.2.2.2")) == "10.0.0.9"    # header ignored
    assert get_client_ip(_request()) == "10.0.0.9"


# ---------------------------------------------------------------- solver deadline and batch limits
def test_deadline_stops_the_solver():
    nodes = {"a": Tank("A", fluid_level=3.0), "b": Tank("B", fluid_level=0.0)}
    edges = [{"source": "a", "target": "b", "pipe": Pipe("p", 5, 0.05)}]
    assert solve(nodes, edges)["success"]   # solves without a deadline
    with pytest.raises(SolveTimeout):
        with solve_deadline(1e-9):
            solve(nodes, edges)


def test_deadline_is_per_block_and_resets():
    with pytest.raises(SolveTimeout):
        with solve_deadline(1e-9):
            check_deadline()
    check_deadline()   # no deadline outside the block


def _graph(n_nodes, n_cases=0):
    return {
        "nodes": [{"id": f"t{i}", "type": "tank", "position": {"x": i, "y": 0}, "data": {}} for i in range(n_nodes)],
        "edges": [],
        "cases": [{"id": f"c{i}", "name": f"Case {i}", "is_base": i == 0} for i in range(n_cases)],
    }


def test_batch_size_limits(client, monkeypatch):
    monkeypatch.setenv("WALFLOW_MAX_NODES", "3")
    monkeypatch.setenv("WALFLOW_MAX_CASES", "2")
    assert client.post("/api/simulation/batch", json=_graph(4)).status_code == 413
    assert client.post("/api/simulation/batch", json=_graph(2, n_cases=3)).status_code == 413
    assert client.post("/api/simulation/batch", json=_graph(2, n_cases=2)).status_code == 200


def test_batch_timeout_is_a_case_error(client, monkeypatch):
    monkeypatch.setenv("WALFLOW_SOLVE_TIMEOUT_S", "0.000001")
    graph = {
        "nodes": [{"id": "a", "type": "tank", "position": {"x": 0, "y": 0}, "data": {}},
                  {"id": "b", "type": "tank", "position": {"x": 1, "y": 0}, "data": {}}],
        "edges": [{"id": "e", "source": "a", "target": "b", "sourceHandle": "port-0", "targetHandle": "port-0",
                   "data": {"length_m": 5, "diameter_m": 0.05}}],
    }
    resp = client.post("/api/simulation/batch", json=graph)
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["status"] == "error" and "time limit" in result["error_message"]


def test_websocket_rejects_oversized_graph(monkeypatch):
    monkeypatch.setenv("WALFLOW_MAX_NODES", "1")
    with TestClient(app).websocket_connect("/ws/simulate") as ws:
        ws.send_text(json.dumps({"action": "run_simulation", "graph": _graph(2)}))
        reply = json.loads(ws.receive_text())
    assert reply["status"] == "error" and "too large" in reply["message"]


# ---------------------------------------------------------------- simulation socket access
def test_anonymous_user_can_use_the_simulation_socket(monkeypatch):
    monkeypatch.delenv("WALFLOW_REQUIRE_WS_AUTH", raising=False)
    with TestClient(app).websocket_connect("/ws/simulate") as ws:
        ws.send_text(json.dumps({"action": "run_simulation"}))
        assert json.loads(ws.receive_text())["status"] == "waiting"


def test_anonymous_user_cannot_join_a_diagram(monkeypatch):
    monkeypatch.delenv("WALFLOW_REQUIRE_WS_AUTH", raising=False)
    with TestClient(app).websocket_connect("/ws/simulate") as ws:
        ws.send_text(json.dumps({"action": "join_diagram", "diagram_id": "x"}))
        reply = json.loads(ws.receive_text())
    assert reply["status"] == "error" and reply["context"] == "join_diagram"


# ---------------------------------------------------------------- admin accounts
def test_last_admin_cannot_be_demoted_disabled_or_deleted(client):
    admin_id, headers, _ = _user("admin")
    _drop_other_admins(admin_id)
    assert client.put(f"/api/admin/users/{admin_id}/role", json={"role": "user"}, headers=headers).status_code == 400
    assert client.post(f"/api/admin/users/{admin_id}/reject", headers=headers).status_code == 400
    assert client.delete(f"/api/admin/users/{admin_id}", headers=headers).status_code == 400
    # with a second admin the first may step down
    _user("admin")
    assert client.put(f"/api/admin/users/{admin_id}/role", json={"role": "user"}, headers=headers).status_code == 200


def test_disabled_user_loses_access_at_once(client):
    _, admin_headers, _ = _user("admin")
    user_id, user_headers, _ = _user()
    assert client.get("/api/auth/me", headers=user_headers).status_code == 200
    assert client.post(f"/api/admin/users/{user_id}/reject", headers=admin_headers).status_code == 200
    assert client.get("/api/auth/me", headers=user_headers).status_code == 403
    assert client.post("/api/auth/refresh", headers=user_headers).status_code == 403
    # re-enabling restores access
    assert client.post(f"/api/admin/users/{user_id}/approve", headers=admin_headers).status_code == 200
    assert client.get("/api/auth/me", headers=user_headers).status_code == 200


def test_pipe_manager_can_be_assigned(client):
    _, admin_headers, _ = _user("admin")
    user_id, _, _ = _user()
    assert client.put(f"/api/admin/users/{user_id}/role", json={"role": "pipe_manager"}, headers=admin_headers).status_code == 200
    assert client.put(f"/api/admin/users/{user_id}/role", json={"role": "root"}, headers=admin_headers).status_code == 400


# ---------------------------------------------------------------- diagram locks and saves
def _standalone_diagram(client, headers, data="{}"):
    resp = client.post("/api/diagrams", json={"title": "D", "diagram_data": data}, headers=headers)
    assert resp.status_code == 201
    return resp.json()


def test_standalone_checkout_and_lock_status_are_owner_only(client):
    _, owner, _ = _user()
    _, other, _ = _user()
    d = _standalone_diagram(client, owner)
    assert client.post(f"/api/diagrams/{d['id']}/checkout", headers=other).status_code == 403
    assert client.get(f"/api/diagrams/{d['id']}/lock-status", headers=other).status_code == 403
    assert client.get(f"/api/diagrams/{d['id']}/lock-status", headers=owner).status_code == 200


def test_join_diagram_needs_access_and_owner_gets_in(client, monkeypatch):
    monkeypatch.delenv("WALFLOW_REQUIRE_WS_AUTH", raising=False)
    _, owner, owner_token = _user()
    _, _, other_token = _user()
    d = _standalone_diagram(client, owner)
    with TestClient(app).websocket_connect(f"/ws/simulate?token={other_token}") as ws:
        ws.send_text(json.dumps({"action": "join_diagram", "diagram_id": d["id"]}))
        assert json.loads(ws.receive_text())["context"] == "join_diagram"
    with TestClient(app).websocket_connect(f"/ws/simulate?token={owner_token}") as ws:
        ws.send_text(json.dumps({"action": "join_diagram", "diagram_id": d["id"]}))
        ws.send_text(json.dumps({"action": "run_simulation"}))   # the first reply is the simulation one: join sent no error
        assert json.loads(ws.receive_text())["status"] == "waiting"


class _FakeSocket:
    def __init__(self):
        self.sent = []

    async def send_text(self, text):
        self.sent.append(json.loads(text))


def test_lock_is_released_when_the_last_socket_of_the_holder_closes():
    async def scenario():
        from services.lock_service import acquire_lock
        manager = ConnectionManager()
        diagram_id = f"d_{uuid.uuid4().hex}"
        a1, a2, watcher = _FakeSocket(), _FakeSocket(), _FakeSocket()
        await manager.connect(a1, diagram_id, "user-a")
        await manager.connect(a2, diagram_id, "user-a")
        await manager.connect(watcher, diagram_id, "user-b")
        acquire_lock(diagram_id, "user-a", "A")
        await release_lock_after_disconnect(manager, manager.disconnect(a1))
        assert get_lock_status_info(diagram_id) is not None            # a second tab of A is still open
        await release_lock_after_disconnect(manager, manager.disconnect(a2))
        assert get_lock_status_info(diagram_id) is None
        assert watcher.sent and watcher.sent[-1]["action"] == "lock_released"
    asyncio.run(scenario())


def test_stale_save_is_rejected_and_current_save_accepted(client):
    _, owner, _ = _user()
    d = _standalone_diagram(client, owner, '{"v":1}')
    first = client.put(f"/api/diagrams/{d['id']}", json={"diagram_data": '{"v":2}', "base_updated_at": d["updated_at"]}, headers=owner)
    assert first.status_code == 200
    # a second tab still holds the version from before the first save
    stale = client.put(f"/api/diagrams/{d['id']}", json={"diagram_data": '{"v":3}', "base_updated_at": d["updated_at"]}, headers=owner)
    assert stale.status_code == 409 and stale.headers.get("X-Walflow-Conflict") == "stale"
    ok = client.put(f"/api/diagrams/{d['id']}", json={"diagram_data": '{"v":3}', "base_updated_at": first.json()["updated_at"]}, headers=owner)
    assert ok.status_code == 200 and ok.json()["diagram_data"] == '{"v":3}'


# ---------------------------------------------------------------- save notices
def test_unchanged_save_does_not_move_updated_at(client):
    _, owner, _ = _user()
    d = _standalone_diagram(client, owner, '{"v":1}')
    same = client.put(f"/api/diagrams/{d['id']}", json={"diagram_data": '{"v":1}', "base_updated_at": d["updated_at"]}, headers=owner)
    assert same.status_code == 200 and same.json()["updated_at"] == d["updated_at"]


def test_notices_are_coalesced(monkeypatch):
    monkeypatch.setenv("WALFLOW_COLLAB_BROADCAST_INTERVAL_S", "0.2")

    async def scenario():
        manager = ConnectionManager()
        ws = _FakeSocket()
        await manager.connect(ws, "d1", "u")
        for i in range(5):
            await manager.notify_diagram_updated("d1", {"action": "diagram_updated", "n": i})
        assert [m["n"] for m in ws.sent] == [0]            # first goes out at once, the rest wait
        await asyncio.sleep(0.4)
        assert [m["n"] for m in ws.sent] == [0, 4]         # one trailing notice with the newest content
    asyncio.run(scenario())
