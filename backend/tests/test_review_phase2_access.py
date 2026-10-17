"""Code-review fixes: diagram delete/checkin access, cascades, user deletion hand-over, invitation password."""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("DATABASE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_b3.db"))

from fastapi.testclient import TestClient

from main import app
from db.database import init_db, SessionLocal
from db.models import User, Project, ProjectMember, ProjectInvitation, Diagram
from auth import hash_password, create_access_token


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


@pytest.fixture
def client():
    return TestClient(app)


def _user(role="user"):
    db = SessionLocal()
    try:
        u = User(username=f"u_{uuid.uuid4().hex[:10]}", password_hash=hash_password("secret_pass_1"), role=role, status="approved")
        db.add(u)
        db.commit()
        token = create_access_token(data={"sub": u.id, "username": u.username, "role": u.role})
        return u.id, {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def _project(owner_id, members=()):
    db = SessionLocal()
    try:
        p = Project(title="P")
        db.add(p)
        db.flush()
        db.add(ProjectMember(project_id=p.id, user_id=owner_id, role="owner"))
        for m in members:
            db.add(ProjectMember(project_id=p.id, user_id=m, role="member"))
        db.commit()
        return p.id
    finally:
        db.close()


def _diagram(user_id, project_id=None):
    db = SessionLocal()
    try:
        d = Diagram(user_id=user_id, project_id=project_id, title="D", diagram_data="{}")
        db.add(d)
        db.commit()
        return d.id
    finally:
        db.close()


def test_removed_member_cannot_delete_their_project_diagram(client):
    owner, _ = _user()
    member, member_h = _user()
    pid = _project(owner, [member])
    did = _diagram(member, pid)
    db = SessionLocal()
    db.query(ProjectMember).filter(ProjectMember.project_id == pid, ProjectMember.user_id == member).delete()
    db.commit()
    db.close()
    assert client.delete(f"/api/diagrams/{did}", headers=member_h).status_code == 403


def test_member_can_delete_own_project_diagram(client):
    owner, _ = _user()
    member, member_h = _user()
    pid = _project(owner, [member])
    did = _diagram(member, pid)
    assert client.delete(f"/api/diagrams/{did}", headers=member_h).status_code == 200


def test_checkin_requires_diagram_access(client):
    owner, _ = _user()
    _, stranger_h = _user()
    did = _diagram(owner)
    assert client.post(f"/api/diagrams/{did}/checkin", headers=stranger_h).status_code == 403


def test_checkin_without_lock_does_not_broadcast(client, monkeypatch):
    owner, owner_h = _user()
    did = _diagram(owner)
    sent = []
    from routers import diagrams

    async def fake_broadcast(diagram_id, message):
        sent.append(message)
    monkeypatch.setattr(diagrams.collab_manager, "broadcast_to_diagram", fake_broadcast)
    assert client.post(f"/api/diagrams/{did}/checkin", headers=owner_h).status_code == 200
    assert sent == []
    assert client.post(f"/api/diagrams/{did}/checkout", headers=owner_h).status_code == 200
    sent.clear()
    assert client.post(f"/api/diagrams/{did}/checkin", headers=owner_h).status_code == 200
    assert [m["action"] for m in sent] == ["lock_released"]


def test_project_with_invitation_can_be_deleted(client):
    owner, owner_h = _user()
    pid = _project(owner)
    r = client.post("/api/invitations", json={"project_id": pid}, headers=owner_h)
    assert r.status_code == 201
    assert client.delete(f"/api/projects/{pid}", headers=owner_h).status_code in (200, 204)
    db = SessionLocal()
    assert db.query(ProjectInvitation).filter(ProjectInvitation.project_id == pid).count() == 0
    db.close()


def test_deleting_user_hands_project_diagrams_to_owner(client):
    _, admin_h = _user(role="admin")
    owner, _ = _user()
    member, _ = _user()
    pid = _project(owner, [member])
    shared = _diagram(member, pid)
    personal = _diagram(member)
    assert client.delete(f"/api/admin/users/{member}", headers=admin_h).status_code == 200
    db = SessionLocal()
    kept = db.query(Diagram).filter(Diagram.id == shared).first()
    assert kept is not None and kept.user_id == owner
    assert db.query(Diagram).filter(Diagram.id == personal).first() is None
    db.close()


def test_invitation_password_is_not_stripped(client):
    owner, owner_h = _user()
    guest, guest_h = _user()
    pid = _project(owner)
    r = client.post("/api/invitations", json={"project_id": pid, "password": " abc "}, headers=owner_h)
    token = r.json()["token"]
    assert client.post(f"/api/invitations/{token}/accept", json={"password": "abc"}, headers=guest_h).status_code == 401
    assert client.post(f"/api/invitations/{token}/accept", json={"password": " abc "}, headers=guest_h).status_code == 200


def test_invitation_expiry_is_bounded(client):
    owner, owner_h = _user()
    pid = _project(owner)
    r = client.post("/api/invitations", json={"project_id": pid, "expires_in_hours": 10**12}, headers=owner_h)
    assert r.status_code == 422


def test_admin_user_list_has_created_at(client):
    _, admin_h = _user(role="admin")
    rows = client.get("/api/admin/users", headers=admin_h).json()
    assert any(row["created_at"] for row in rows)


def test_deleted_user_token_gives_401(client):
    uid, h = _user()
    db = SessionLocal()
    db.query(User).filter(User.id == uid).delete()
    db.commit()
    db.close()
    assert client.get("/api/diagrams", headers=h).status_code == 401
