"""Create or reset the standard WalFlow test accounts and their shared test project.

Writes straight to the local SQLite database the backend uses (DATABASE_PATH, else backend/walflow.db),
so no admin login is needed. Safe to run again: existing test accounts get their password, role and
"approved" status back. Accounts other than the test accounts are never touched.

Usage (from the repo root, with the backend venv):
    .venv/Scripts/python .claude/skills/walflow-test-users/scripts/seed_test_users.py
    ... --reset-drawings   also delete every drawing in the test project
    ... --list             only print the test accounts and whether they exist
"""
import argparse
import os
import sys

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "backend"))
sys.path.insert(0, BACKEND_DIR)

PASSWORD = "walflow-test-2026"
TEST_PROJECT = "WalFlow Test Team"
# username, app role, role in the test project
TEST_USERS = [
    ("test_admin", "admin", "owner"),
    ("test_alice", "user", "member"),
    ("test_bob", "user", "member"),
    ("test_pipes", "pipe_manager", "member"),
]


def _refuse_non_test_env(allow):
    if allow:
        return
    if os.getenv("ENVIRONMENT") == "production" or os.getenv("WALFLOW_SECRET_KEY"):
        sys.exit("Refusing: ENVIRONMENT=production or WALFLOW_SECRET_KEY is set, which marks a deployed server. "
                 "Pass --allow-configured-env only if this really is a test environment.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset-drawings", action="store_true", help="delete all drawings in the test project")
    parser.add_argument("--list", action="store_true", help="only list the test accounts")
    parser.add_argument("--allow-configured-env", action="store_true", help="skip the deployed-server guard")
    args = parser.parse_args()
    _refuse_non_test_env(args.allow_configured_env)

    from db.database import DB_PATH, SessionLocal, init_db
    from db.models import Diagram, Project, ProjectMember, User
    from auth import hash_password

    init_db()
    db = SessionLocal()
    try:
        if args.list:
            for username, role, _ in TEST_USERS:
                user = db.query(User).filter(User.username == username).first()
                state = f"{user.role}, {user.status}" if user else "missing"
                print(f"{username:<12} {role:<13} {state}")
            return

        users = {}
        for username, role, _ in TEST_USERS:
            user = db.query(User).filter(User.username == username).first()
            if user is None:
                user = User(username=username)
                db.add(user)
            user.password_hash = hash_password(PASSWORD)
            user.role = role
            user.status = "approved"
            users[username] = user
        db.flush()

        project = db.query(Project).filter(Project.title == TEST_PROJECT).first()
        if project is None:
            project = Project(title=TEST_PROJECT, description="Shared project for test accounts (seed_test_users.py).")
            db.add(project)
            db.flush()
        for username, _, project_role in TEST_USERS:
            member = db.query(ProjectMember).filter(
                ProjectMember.project_id == project.id, ProjectMember.user_id == users[username].id
            ).first()
            if member is None:
                db.add(ProjectMember(project_id=project.id, user_id=users[username].id, role=project_role))
            else:
                member.role = project_role

        removed = 0
        if args.reset_drawings:
            removed = db.query(Diagram).filter(Diagram.project_id == project.id).delete()
        db.commit()
    finally:
        db.close()

    print(f"Database: {DB_PATH}")
    print(f"Accounts: {', '.join(u for u, _, _ in TEST_USERS)} (password for all: {PASSWORD})")
    print(f"Project:  {TEST_PROJECT}" + (f" ({removed} drawings deleted)" if args.reset_drawings else ""))


if __name__ == "__main__":
    main()
