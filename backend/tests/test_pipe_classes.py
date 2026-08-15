import unittest
import json
import os
import sys

# Ensure tests use an isolated test database
TEST_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_pipe_classes.db")
os.environ["DATABASE_PATH"] = TEST_DB_PATH

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fastapi.testclient import TestClient
from main import app
from db.database import init_db, engine, Base
from db.models import User
from auth import hash_password, create_access_token


class TestPipeClassesDatabase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.drop_all(bind=engine)
        init_db()
        cls.client = TestClient(app)

        # Setup test users
        from db.database import SessionLocal
        db = SessionLocal()
        try:
            # 1. Admin
            admin = User(
                id="admin-user-id",
                username="admin_tester",
                password_hash=hash_password("admin_secret"),
                role="admin",
                status="approved"
            )
            # 2. Pipe Manager
            pipe_mgr = User(
                id="mgr-user-id",
                username="pipe_mgr_tester",
                password_hash=hash_password("mgr_secret"),
                role="pipe_manager",
                status="approved"
            )
            # 3. Regular user
            reg_user = User(
                id="reg-user-id",
                username="reg_tester",
                password_hash=hash_password("user_secret"),
                role="user",
                status="approved"
            )
            db.add_all([admin, pipe_mgr, reg_user])
            db.commit()
        finally:
            db.close()

        cls.admin_token = create_access_token({"sub": "admin-user-id"})
        cls.mgr_token = create_access_token({"sub": "mgr-user-id"})
        cls.user_token = create_access_token({"sub": "reg-user-id"})

        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}
        cls.mgr_headers = {"Authorization": f"Bearer {cls.mgr_token}"}
        cls.user_headers = {"Authorization": f"Bearer {cls.user_token}"}

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except OSError:
                pass

    def test_01_default_example_classes_seeded(self):
        """Verify the 4 default example classes exist in database."""
        resp = self.client.get("/api/pipe-classes")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(len(data), 4)

        codes = {c["code"]: c for c in data}
        self.assertIn("CS01", codes)
        self.assertIn("SS01", codes)
        self.assertIn("LT01", codes)
        self.assertIn("DX01", codes)

        # Check CS01 details
        cs01 = codes["CS01"]
        self.assertEqual(cs01["rating_class"], "CL150")
        self.assertEqual(cs01["material_group"], "CS")
        self.assertEqual(cs01["roughness_mm"], 0.045)
        self.assertEqual(cs01["is_builtin"], True)
        self.assertGreater(len(cs01["sizes"]), 5)

        # Check DN50 in CS01: OD=60.3, WT=3.91 -> ID=52.48
        dn50 = next((s for s in cs01["sizes"] if s["dn"] == 50), None)
        self.assertIsNotNone(dn50)
        self.assertEqual(dn50["od_mm"], 60.3)
        self.assertEqual(dn50["wt_mm"], 3.91)
        self.assertAlmostEqual(dn50["id_mm"], 52.48, places=2)

    def test_02_get_single_class_by_code_or_id(self):
        """Retrieve single pipe class by code."""
        resp = self.client.get("/api/pipe-classes/SS01")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["code"], "SS01")
        self.assertEqual(data["roughness_mm"], 0.015)
        self.assertEqual(data["is_builtin"], True)

    def test_03_create_custom_class_permissions(self):
        """Ensure regular user is forbidden, but pipe_manager and admin can create."""
        payload = {
            "code": "CUST01",
            "name": "Custom Hastelloy C276 150#",
            "standard": "CUSTOM",
            "material_group": "HAST",
            "material_grade": "ASTM B574 UNS N10276",
            "rating_class": "CL150",
            "design_code": "ASME B31.3",
            "roughness_mm": 0.005,
            "corrosion_allowance_mm": 0.0,
            "revision": "1.0",
            "sizes": [
                {"dn": 25, "nps": "1", "od_mm": 33.4, "wt_mm": 2.77, "id_mm": 27.86, "sch": "10S"},
                {"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 2.77, "id_mm": 54.76, "sch": "10S"}
            ],
            "temp_pressures": [
                {"temp_c": 38.0, "press_bar": 20.0}
            ]
        }

        # 1. Regular user should fail
        resp_user = self.client.post("/api/pipe-classes", json=payload, headers=self.user_headers)
        self.assertEqual(resp_user.status_code, 403)

        # 2. Pipe manager should succeed
        resp_mgr = self.client.post("/api/pipe-classes", json=payload, headers=self.mgr_headers)
        self.assertEqual(resp_mgr.status_code, 201)
        created = resp_mgr.json()
        self.assertEqual(created["code"], "CUST01")
        self.assertEqual(created["is_builtin"], False)
        self.assertEqual(len(created["sizes"]), 2)

    def test_04_dimension_validation_on_create(self):
        """Verify OD <= 2*WT is rejected."""
        payload = {
            "code": "BAD01",
            "name": "Bad Dimensions Class",
            "material_group": "CS",
            "material_grade": "ASTM A106",
            "rating_class": "CL150",
            "sizes": [
                {"dn": 50, "nps": "2", "od_mm": 50.0, "wt_mm": 30.0}  # OD (50) < 2*WT (60)
            ]
        }
        resp = self.client.post("/api/pipe-classes", json=payload, headers=self.mgr_headers)
        self.assertEqual(resp.status_code, 400)


    def test_05_can_modify_and_delete_example_classes(self):
        """Verify example classes can be edited and deleted by managers."""
        # Edit CS01 (e.g. revision and design code)
        resp_put = self.client.put(
            "/api/pipe-classes/CS01",
            json={"name": "Customized CS01", "design_code": "ASME B31.4", "revision": "2.0"},
            headers=self.mgr_headers
        )
        self.assertEqual(resp_put.status_code, 200)
        self.assertEqual(resp_put.json()["design_code"], "ASME B31.4")
        self.assertEqual(resp_put.json()["revision"], "2.0")

        # Delete DX01
        resp_del = self.client.delete(
            "/api/pipe-classes/DX01",
            headers=self.mgr_headers
        )
        self.assertEqual(resp_del.status_code, 204)

        # Verify DX01 is gone
        resp_get = self.client.get("/api/pipe-classes/DX01")
        self.assertEqual(resp_get.status_code, 404)

        # Restore via seed-examples
        resp_seed = self.client.post("/api/pipe-classes/seed-examples", headers=self.mgr_headers)
        self.assertEqual(resp_seed.status_code, 200)
        self.assertIn("DX01", resp_seed.json()["created"])

    def test_06_update_and_delete_custom_class(self):
        """Verify updating and deleting a custom class."""
        # Update CUST01
        resp_put = self.client.put(
            "/api/pipe-classes/CUST01",
            json={"name": "Updated Custom Hastelloy 150#", "roughness_mm": 0.007},
            headers=self.mgr_headers
        )
        self.assertEqual(resp_put.status_code, 200)
        self.assertEqual(resp_put.json()["name"], "Updated Custom Hastelloy 150#")
        self.assertEqual(resp_put.json()["roughness_mm"], 0.007)

        # Delete CUST01
        resp_del = self.client.delete(
            "/api/pipe-classes/CUST01",
            headers=self.mgr_headers
        )
        self.assertEqual(resp_del.status_code, 204)


    def test_07_tr2000_terms_and_conditions_check(self):
        """Verify syncing TR2000 without agreeing to Equinor terms and conditions fails with 400."""
        payload = {
            "plant_id": 109,
            "pcs_code": "AC140",
            "agreed_to_terms": False
        }
        resp = self.client.post("/api/pipe-classes/tr2000/sync", json=payload, headers=self.mgr_headers)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Terms and Conditions", resp.json()["detail"])

    def test_08_tr2000_sync_with_mocked_service(self):
        """Verify successful TR2000 synchronization and normalization into DB."""
        from unittest.mock import patch

        fake_normalized = {
            "code": "AC140",
            "name": "Equinor Carbon Steel High Pressure AC140",
            "standard": "TR2000",
            "material_group": "CS",
            "material_grade": "ASTM A106 Gr. B",
            "rating_class": "CL300",
            "design_code": "ASME B31.3",
            "roughness_mm": 0.045,
            "corrosion_allowance_mm": 3.0,
            "min_temp_c": -29.0,
            "max_temp_c": 200.0,
            "revision": "B",
            "source_plant_id": 109,
            "sizes": [
                {"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 5.54, "id_mm": 49.22, "sch": "80", "ca_mm": 3.0},
                {"dn": 100, "nps": "4", "od_mm": 114.3, "wt_mm": 8.56, "id_mm": 97.18, "sch": "80", "ca_mm": 3.0}
            ],
            "temp_pressures": [
                {"temp_c": 38.0, "press_bar": 51.1},
                {"temp_c": 100.0, "press_bar": 46.6}
            ]
        }

        with patch("routers.pipe_classes.fetch_and_normalize_tr2000_pcs", return_value=fake_normalized):
            payload = {
                "plant_id": 109,
                "pcs_code": "AC140",
                "agreed_to_terms": True
            }
            resp = self.client.post("/api/pipe-classes/tr2000/sync", json=payload, headers=self.mgr_headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["code"], "AC140")
            self.assertEqual(data["standard"], "TR2000")
            self.assertEqual(data["rating_class"], "CL300")
            self.assertEqual(len(data["sizes"]), 2)
            self.assertEqual(data["sizes"][0]["id_mm"], 49.22)

            # Verify it's now in DB
            resp_get = self.client.get("/api/pipe-classes/AC140")
            self.assertEqual(resp_get.status_code, 200)
            self.assertEqual(resp_get.json()["code"], "AC140")

    def test_09_export_library(self):
        """Verify exporting library returns all pipe classes."""
        resp = self.client.get("/api/pipe-classes/export/library")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 4)
        codes = [c["code"] for c in data]
        self.assertIn("CS01", codes)

    def test_10_import_library_with_duplicates_skipped(self):
        """Verify importing a library checks for duplicates and skips existing codes."""
        payload = {
            "classes": [
                # Existing duplicate code (should be skipped)
                {
                    "code": "CS01",
                    "name": "Duplicate CS01",
                    "sizes": [{"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 3.91, "sch": "STD"}]
                },
                # Brand new code (should be imported)
                {
                    "code": "INCONEL625",
                    "name": "Inconel 625 High Temperature",
                    "standard": "CUSTOM",
                    "material_group": "NI",
                    "material_grade": "Inconel 625",
                    "rating_class": "CL600",
                    "design_code": "ASME B31.3",
                    "roughness_mm": 0.010,
                    "corrosion_allowance_mm": 0.0,
                    "sizes": [
                        {"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 5.54, "sch": "80"}
                    ]
                }
            ]
        }

        resp = self.client.post("/api/pipe-classes/import/library", json=payload, headers=self.mgr_headers)
        self.assertEqual(resp.status_code, 200)
        result = resp.json()
        self.assertIn("INCONEL625", result["imported"])
        self.assertIn("CS01", result["skipped_duplicates"])
        self.assertEqual(result["imported_count"], 1)
        self.assertEqual(result["skipped_count"], 1)

        # Verify INCONEL625 exists in catalog
        resp_get = self.client.get("/api/pipe-classes/INCONEL625")
        self.assertEqual(resp_get.status_code, 200)
        self.assertEqual(resp_get.json()["code"], "INCONEL625")

    def test_12_project_allowed_pipe_classes_toggle_and_reset(self):
        """Verify project allowed_pipe_classes can be updated to subset and reset back to None (all allowed)."""
        # Create a project
        resp_proj = self.client.post("/api/projects", json={"title": "Spec Filter Project"}, headers=self.admin_headers)
        self.assertEqual(resp_proj.status_code, 201)
        proj_id = resp_proj.json()["id"]
        self.assertIsNone(resp_proj.json()["allowed_pipe_classes"])


        # Restrict to ['CS01']
        resp_put1 = self.client.put(f"/api/projects/{proj_id}", json={"allowed_pipe_classes": ["CS01"]}, headers=self.admin_headers)
        self.assertEqual(resp_put1.status_code, 200)
        self.assertEqual(resp_put1.json()["allowed_pipe_classes"], ["CS01"])

        # Reset back to None (all allowed)
        resp_put2 = self.client.put(f"/api/projects/{proj_id}", json={"allowed_pipe_classes": None}, headers=self.admin_headers)
        self.assertEqual(resp_put2.status_code, 200)
        self.assertIsNone(resp_put2.json()["allowed_pipe_classes"])

    def test_13_project_allow_custom_pipes_toggle(self):
        """Verify project allow_custom_pipes can be toggled on/off."""
        resp_proj = self.client.post(
            "/api/projects",
            json={"title": "Custom Dimension Policy Project", "allow_custom_pipes": True},
            headers=self.admin_headers
        )
        self.assertEqual(resp_proj.status_code, 201)
        proj_id = resp_proj.json()["id"]
        self.assertTrue(resp_proj.json()["allow_custom_pipes"])

        # Disable custom pipes
        resp_put = self.client.put(
            f"/api/projects/{proj_id}",
            json={"allow_custom_pipes": False},
            headers=self.admin_headers
        )
        self.assertEqual(resp_put.status_code, 200)
        self.assertFalse(resp_put.json()["allow_custom_pipes"])

        # Re-enable custom pipes
        resp_put2 = self.client.put(
            f"/api/projects/{proj_id}",
            json={"allow_custom_pipes": True},
            headers=self.admin_headers
        )
        self.assertEqual(resp_put2.status_code, 200)
        self.assertTrue(resp_put2.json()["allow_custom_pipes"])


if __name__ == "__main__":
    unittest.main()




