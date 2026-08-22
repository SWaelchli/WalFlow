import unittest
import json
import os
import sys

# Ensure tests use an isolated test database
TEST_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_fitting_standards.db")
os.environ["DATABASE_PATH"] = TEST_DB_PATH

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fastapi.testclient import TestClient
from main import app
from db.database import init_db, engine, Base, SessionLocal
from db.models import User, FittingStandard
from auth import hash_password, create_access_token


class TestFittingStandardsDatabase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.drop_all(bind=engine)
        init_db()
        cls.client = TestClient(app)

        # Setup test users
        db = SessionLocal()
        try:
            admin = User(
                id="admin-user-id",
                username="admin_tester",
                password_hash=hash_password("admin_secret"),
                role="admin",
                status="approved"
            )
            pipe_mgr = User(
                id="pipemgr-user-id",
                username="pipemgr_tester",
                password_hash=hash_password("pipemgr_secret"),
                role="pipe_manager",
                status="approved"
            )
            regular = User(
                id="regular-user-id",
                username="regular_tester",
                password_hash=hash_password("user_secret"),
                role="user",
                status="approved"
            )
            db.add_all([admin, pipe_mgr, regular])
            db.commit()

            cls.admin_token = create_access_token(data={"sub": admin.id})
            cls.pipemgr_token = create_access_token(data={"sub": pipe_mgr.id})
            cls.user_token = create_access_token(data={"sub": regular.id})

        finally:
            db.close()

    @classmethod
    def tearDownClass(cls):
        try:
            if os.path.exists(TEST_DB_PATH):
                os.remove(TEST_DB_PATH)
        except Exception:
            pass

    def test_01_seed_defaults_present(self):
        """Verifies default fitting standards are automatically seeded."""
        res = self.client.get("/api/fitting-standards")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreaterEqual(len(data), 2)

        codes = [item["code"] for item in data]
        self.assertIn("ASME_B16_9_REDUCERS", codes)
        self.assertIn("ASME_B36_10M_SCHEDULES", codes)

    def test_02_filter_by_type(self):
        """Verifies filtering by fitting_type."""
        res = self.client.get("/api/fitting-standards?fitting_type=reducer")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        for item in data:
            self.assertEqual(item["fitting_type"], "reducer")

    def test_03_get_by_code(self):
        """Verifies retrieving specific standard details."""
        res = self.client.get("/api/fitting-standards/ASME_B16_9_REDUCERS")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["code"], "ASME_B16_9_REDUCERS")
        self.assertTrue(data["is_builtin"])
        self.assertGreater(len(data["dimensions"]), 0)

    def test_04_create_and_update_custom_fitting_standard(self):
        """Verifies creating and updating a custom fitting standard."""
        headers = {"Authorization": f"Bearer {self.pipemgr_token}"}
        payload = {
            "code": "DIN_EN_10253_REDUCERS",
            "name": "DIN EN 10253 Wrought Reducers",
            "standard": "DIN_EN",
            "fitting_type": "reducer",
            "subtype": "concentric",
            "dimensions": [
                {"dn_large": 80, "dn_small": 50, "length_mm": 90.0, "od_large_mm": 88.9, "od_small_mm": 60.3}
            ]
        }

        res = self.client.post("/api/fitting-standards", json=payload, headers=headers)
        self.assertEqual(res.status_code, 201)
        created = res.json()
        self.assertEqual(created["code"], "DIN_EN_10253_REDUCERS")
        self.assertFalse(created["is_builtin"])

        # Update
        update_res = self.client.put(
            f"/api/fitting-standards/{created['id']}",
            json={"name": "DIN EN 10253 Type A Reducers"},
            headers=headers
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["name"], "DIN EN 10253 Type A Reducers")

        # Regular user cannot delete
        user_headers = {"Authorization": f"Bearer {self.user_token}"}
        del_fail = self.client.delete(f"/api/fitting-standards/{created['id']}", headers=user_headers)
        self.assertEqual(del_fail.status_code, 403)

        # Pipe manager can delete
        del_ok = self.client.delete(f"/api/fitting-standards/{created['id']}", headers=headers)
        self.assertEqual(del_ok.status_code, 200)

    def test_05_clone_standard(self):
        """Verifies cloning built-in standard to editable copy."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        res = self.client.post(
            "/api/fitting-standards/ASME_B16_9_REDUCERS/clone",
            json={"new_code": "ASME_B16_9_CUSTOM_V1", "new_name": "Cloned Reducers"},
            headers=headers
        )
        self.assertEqual(res.status_code, 201)
        cloned = res.json()
        self.assertEqual(cloned["code"], "ASME_B16_9_CUSTOM_V1")
        self.assertFalse(cloned["is_builtin"])

        # Cleanup
        self.client.delete(f"/api/fitting-standards/{cloned['id']}", headers=headers)

    def test_06_export_and_import(self):
        """Verifies JSON library export and import."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        exp_res = self.client.get("/api/fitting-standards/export-library")
        self.assertEqual(exp_res.status_code, 200)
        catalog = exp_res.json()
        self.assertIsInstance(catalog, list)

        imp_res = self.client.post("/api/fitting-standards/import-library", json=catalog, headers=headers)
        self.assertEqual(imp_res.status_code, 200)
        self.assertIn("status", imp_res.json())
