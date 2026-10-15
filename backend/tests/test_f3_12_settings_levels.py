"""F3-12: global (user) and project settings are stored in the database."""
import os
import sys
import unittest

TEST_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_f3_12_settings.db")
os.environ["DATABASE_PATH"] = TEST_DB_PATH
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fastapi.testclient import TestClient
from main import app
from db.database import init_db, engine, Base, SessionLocal
from db.models import User
from auth import hash_password, create_access_token


class TestSettingsLevels(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.drop_all(bind=engine)
        init_db()
        cls.client = TestClient(app)
        db = SessionLocal()
        try:
            db.add_all([
                User(id="owner-id", username="owner_f312", password_hash=hash_password("secret123"), role="user", status="approved"),
                User(id="member-id", username="member_f312", password_hash=hash_password("secret123"), role="user", status="approved"),
            ])
            db.commit()
        finally:
            db.close()
        cls.owner = {"Authorization": f"Bearer {create_access_token({'sub': 'owner-id'})}"}
        cls.member = {"Authorization": f"Bearer {create_access_token({'sub': 'member-id'})}"}

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except OSError:
                pass

    def setUp(self):
        db = SessionLocal()
        try:
            db.query(User).update({User.settings: None})
            db.commit()
        finally:
            db.close()

    def test_user_settings_default_and_roundtrip(self):
        r = self.client.get("/api/settings", headers=self.owner)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["unit_system"], "metric")
        self.assertEqual(r.json()["solver"]["solver_method"], "sparse_newton")
        self.assertFalse(r.json()["stored"])

        body = {"unit_system": "imperial", "solver": {"tolerance": 1e-8, "damping_factor": 0.5}}
        r = self.client.put("/api/settings", json=body, headers=self.owner)
        self.assertEqual(r.status_code, 200)
        r = self.client.get("/api/settings", headers=self.owner)
        self.assertEqual(r.json()["unit_system"], "imperial")
        self.assertEqual(r.json()["solver"]["tolerance"], 1e-8)
        self.assertTrue(r.json()["stored"])

    def test_user_settings_are_per_user_and_need_login(self):
        self.client.put("/api/settings", json={"unit_system": "imperial"}, headers=self.owner)
        r = self.client.get("/api/settings", headers=self.member)
        self.assertEqual(r.json()["unit_system"], "metric")
        self.assertIn(self.client.get("/api/settings").status_code, (401, 403))

    def test_user_settings_reject_out_of_range_values(self):
        for solver in ({"tolerance": 1.0}, {"damping_factor": 0}, {"inner_iterations": 0}, {"solver_method": "x"}, {"unknown": 1}):
            r = self.client.put("/api/settings", json={"solver": solver}, headers=self.owner)
            self.assertEqual(r.status_code, 422, solver)

    def test_project_settings_default_roundtrip_and_owner_only(self):
        pid = self.client.post("/api/projects", json={"title": "F3-12"}, headers=self.owner).json()["id"]
        detail = self.client.get(f"/api/projects/{pid}", headers=self.owner).json()
        self.assertFalse(detail["settings"]["use_project_solver"])

        self.client.post(f"/api/projects/{pid}/members", json={"username": "member_f312"}, headers=self.owner)
        body = {"settings": {"use_project_solver": True, "solver": {"solver_method": "lm", "control_iterations": 50}}}
        r = self.client.put(f"/api/projects/{pid}", json=body, headers=self.owner)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["settings"]["use_project_solver"])
        self.assertEqual(r.json()["settings"]["solver"]["control_iterations"], 50)

        # members can read, but not change
        detail = self.client.get(f"/api/projects/{pid}", headers=self.member).json()
        self.assertEqual(detail["settings"]["solver"]["solver_method"], "lm")
        r = self.client.put(f"/api/projects/{pid}", json={"settings": {"use_project_solver": False}}, headers=self.member)
        self.assertEqual(r.status_code, 403)

        # unrelated project updates keep the settings
        self.client.put(f"/api/projects/{pid}", json={"title": "Renamed"}, headers=self.owner)
        detail = self.client.get(f"/api/projects/{pid}", headers=self.owner).json()
        self.assertTrue(detail["settings"]["use_project_solver"])

    def test_migration_adds_settings_columns(self):
        from sqlalchemy import inspect
        insp = inspect(engine)
        self.assertIn("settings", [c["name"] for c in insp.get_columns("users")])
        self.assertIn("settings", [c["name"] for c in insp.get_columns("projects")])


if __name__ == "__main__":
    unittest.main()
