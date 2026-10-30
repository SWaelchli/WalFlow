"""Global (user) and project settings are stored in the database."""


import unittest


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
        self.assertEqual((r.json()["pressure_basis"], r.json()["flow_unit"]), ("absolute", "lmin"))

        body = {"unit_system": "imperial", "solver": {"tolerance": 1e-8, "control_iterations": 50}}
        r = self.client.put("/api/settings", json=body, headers=self.owner)
        self.assertEqual(r.status_code, 200)
        r = self.client.get("/api/settings", headers=self.owner)
        self.assertEqual(r.json()["unit_system"], "imperial")
        self.assertEqual(r.json()["solver"]["tolerance"], 1e-8)
        self.assertTrue(r.json()["stored"])

    def test_display_preferences_roundtrip_and_default_when_missing_in_stored_data(self):
        for basis, flow in (("absolute", "lmin"), ("gauge", "m3h"), ("gauge", "lmin"), ("absolute", "m3h")):
            body = {"unit_system": "metric", "pressure_basis": basis, "flow_unit": flow}
            self.assertEqual(self.client.put("/api/settings", json=body, headers=self.owner).status_code, 200)
            got = self.client.get("/api/settings", headers=self.owner).json()
            self.assertEqual((got["pressure_basis"], got["flow_unit"]), (basis, flow))
        # A row stored before the two preferences existed falls back to the defaults
        db = SessionLocal()
        try:
            db.query(User).filter(User.id == "owner-id").update({User.settings: '{"unit_system": "imperial", "solver": {}}'})
            db.commit()
        finally:
            db.close()
        got = self.client.get("/api/settings", headers=self.owner).json()
        self.assertEqual((got["unit_system"], got["pressure_basis"], got["flow_unit"]), ("imperial", "absolute", "lmin"))

    def test_user_settings_are_per_user_and_need_login(self):
        self.client.put("/api/settings", json={"unit_system": "imperial"}, headers=self.owner)
        r = self.client.get("/api/settings", headers=self.member)
        self.assertEqual(r.json()["unit_system"], "metric")
        self.assertIn(self.client.get("/api/settings").status_code, (401, 403))

    def test_user_settings_reject_out_of_range_values(self):
        for solver in ({"tolerance": 1.0}, {"inner_iterations": 0}, {"solver_method": "x"}, {"unknown": 1}):
            r = self.client.put("/api/settings", json={"solver": solver}, headers=self.owner)
            self.assertEqual(r.status_code, 422, solver)
        for body in ({"pressure_basis": "relative"}, {"pressure_basis": "barg"}, {"flow_unit": "gpm"}, {"flow_unit": "m3s"}):
            r = self.client.put("/api/settings", json=body, headers=self.owner)
            self.assertEqual(r.status_code, 422, body)

    def test_retired_damping_factor_is_accepted_and_dropped(self):
        # Older clients and stored rows still carry the retired TCV damping factor
        r = self.client.put("/api/settings", json={"solver": {"damping_factor": 0.5, "tolerance": 1e-7}}, headers=self.owner)
        self.assertEqual(r.status_code, 200)
        solver = self.client.get("/api/settings", headers=self.owner).json()["solver"]
        self.assertEqual(solver["tolerance"], 1e-7)
        self.assertNotIn("damping_factor", solver)

    def test_project_settings_default_roundtrip_and_owner_only(self):
        pid = self.client.post("/api/projects", json={"title": "settings"}, headers=self.owner).json()["id"]
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
