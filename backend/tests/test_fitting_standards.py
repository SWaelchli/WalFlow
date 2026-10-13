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

    def test_07_din_en_reducers_seeded(self):
        """DIN EN 10253-2 reducers are seeded as a built-in reducer standard."""
        res = self.client.get("/api/fitting-standards/DIN_EN_10253_2_REDUCERS")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["is_builtin"])
        self.assertEqual(data["fitting_type"], "reducer")
        entry = next(d for d in data["dimensions"] if d["dn_large"] == 80 and d["dn_small"] == 50)
        self.assertEqual(entry["od_large_mm"], 88.9)
        self.assertAlmostEqual(entry["cone_angle_deg"], 18.2, delta=0.1)

    def test_08_lookup_by_code_is_case_insensitive(self):
        res = self.client.get("/api/fitting-standards/asme_b16_9_reducers")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["code"], "ASME_B16_9_REDUCERS")

    def test_09_create_rejects_invalid_dimensions_and_type(self):
        headers = {"Authorization": f"Bearer {self.pipemgr_token}"}
        bad_dims = {
            "code": "BAD_RED", "name": "Bad", "fitting_type": "reducer",
            "dimensions": [{"dn_large": 50, "dn_small": 80, "length_mm": 76}, {"dn_large": 80}]
        }
        res = self.client.post("/api/fitting-standards", json=bad_dims, headers=headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("must exceed dn_small", res.json()["detail"])
        self.assertIn("dimensions[1]", res.json()["detail"])

        bad_type = {"code": "BAD_TYPE", "name": "Bad", "fitting_type": "flange", "dimensions": []}
        res = self.client.post("/api/fitting-standards", json=bad_type, headers=headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("fitting_type", res.json()["detail"])

    def test_10_import_is_validated_atomically(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        payload = [
            {"code": "IMPORT_OK", "name": "Ok", "fitting_type": "reducer",
             "dimensions": [{"dn_large": 80, "dn_small": 50, "length_mm": 89}]},
            {"code": "X" * 60, "name": "Too long", "fitting_type": "reducer", "dimensions": []},
            {"code": "IMPORT_BAD_DIMS", "fitting_type": "reducer", "dimensions": "not a list"},
        ]
        res = self.client.post("/api/fitting-standards/import-library", json=payload, headers=headers)
        self.assertEqual(res.status_code, 400)
        detail = res.json()["detail"]
        self.assertIn("Entry 1", detail)
        self.assertIn("Entry 2", detail)
        # Nothing was imported, including the valid entry
        self.assertEqual(self.client.get("/api/fitting-standards/IMPORT_OK").status_code, 404)

        too_many = [{"code": f"C{i}", "fitting_type": "reducer", "dimensions": []} for i in range(201)]
        res = self.client.post("/api/fitting-standards/import-library", json=too_many, headers=headers)
        self.assertEqual(res.status_code, 400)

    def test_11_delete_blocked_while_referenced_by_pipe_class(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        std = self.client.post("/api/fitting-standards", json={
            "code": "REF_RED", "name": "Referenced", "fitting_type": "reducer",
            "dimensions": [{"dn_large": 80, "dn_small": 50, "length_mm": 89}]
        }, headers=headers)
        self.assertEqual(std.status_code, 201)

        pc = self.client.post("/api/pipe-classes", json={
            "code": "REF_PC", "name": "Ref class", "standard": "CUSTOM",
            "material_group": "CS", "material_grade": "A106 B", "rating_class": "CL150",
            "reducer_standard_code": "ref_red",
            "sizes": [{"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 3.91, "sch": "40"}]
        }, headers=headers)
        self.assertEqual(pc.status_code, 201, pc.text)
        self.assertEqual(pc.json()["reducer_standard_code"], "REF_RED")

        blocked = self.client.delete("/api/fitting-standards/REF_RED", headers=headers)
        self.assertEqual(blocked.status_code, 409)
        self.assertIn("REF_PC", blocked.json()["detail"])

        self.client.delete(f"/api/pipe-classes/{pc.json()['id']}", headers=headers)
        self.assertEqual(self.client.delete("/api/fitting-standards/REF_RED", headers=headers).status_code, 200)

    def test_12_pipe_class_rejects_unknown_or_wrong_type_standard(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        base = {
            "code": "BADREF_PC", "name": "Bad ref", "standard": "CUSTOM",
            "material_group": "CS", "material_grade": "A106 B", "rating_class": "CL150",
            "sizes": [{"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 3.91, "sch": "40"}]
        }
        res = self.client.post("/api/pipe-classes", json={**base, "reducer_standard_code": "NOPE"}, headers=headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not exist", res.json()["detail"])

        # A schedule standard is not a valid reducer standard
        res = self.client.post("/api/pipe-classes", json={**base, "reducer_standard_code": "ASME_B36_10M_SCHEDULES"}, headers=headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("expected 'reducer'", res.json()["detail"])

        ok = self.client.post("/api/pipe-classes", json={**base, "reducer_standard_code": "DIN_EN_10253_2_REDUCERS"}, headers=headers)
        self.assertEqual(ok.status_code, 201, ok.text)
        upd = self.client.put(f"/api/pipe-classes/{ok.json()['id']}", json={"reducer_standard_code": "NOPE"}, headers=headers)
        self.assertEqual(upd.status_code, 400)
        self.client.delete(f"/api/pipe-classes/{ok.json()['id']}", headers=headers)

    def test_13_pipe_class_library_import_keeps_standard_codes(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        size = [{"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 3.91, "sch": "40"}]
        res = self.client.post("/api/pipe-classes/import/library", json={"classes": [
            {"code": "IMP_DIN", "sizes": size, "reducer_standard_code": "DIN_EN_10253_2_REDUCERS"},
            {"code": "IMP_BAD", "sizes": size, "reducer_standard_code": "NOPE"},
        ]}, headers=headers)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["imported"], ["IMP_DIN"])
        self.assertEqual(len(body["invalid_entries"]), 1)

        listed = self.client.get("/api/pipe-classes", headers=headers).json()
        imp = next(c for c in listed if c["code"] == "IMP_DIN")
        self.assertEqual(imp["reducer_standard_code"], "DIN_EN_10253_2_REDUCERS")
        self.client.delete(f"/api/pipe-classes/{imp['id']}", headers=headers)

    def test_14_restore_builtins(self):
        admin = {"Authorization": f"Bearer {self.admin_token}"}
        mgr = {"Authorization": f"Bearer {self.pipemgr_token}"}
        original = self.client.get("/api/fitting-standards/ASME_B16_9_REDUCERS").json()

        # Admin edits a built-in; a plain re-seed does not touch it
        res = self.client.put("/api/fitting-standards/ASME_B16_9_REDUCERS", json={"name": "Edited"}, headers=admin)
        self.assertEqual(res.status_code, 200)
        self.client.post("/api/fitting-standards/seed-defaults", headers=admin)
        self.assertEqual(self.client.get("/api/fitting-standards/ASME_B16_9_REDUCERS").json()["name"], "Edited")

        # Only admins may restore
        self.assertEqual(self.client.post("/api/fitting-standards/seed-defaults?restore_builtins=true", headers=mgr).status_code, 403)

        res = self.client.post("/api/fitting-standards/seed-defaults?restore_builtins=true", headers=admin)
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.json()["restored_count"], 3)
        restored = self.client.get("/api/fitting-standards/ASME_B16_9_REDUCERS").json()
        self.assertEqual(restored["name"], original["name"])
        self.assertEqual(restored["dimensions"], original["dimensions"])

    def test_20_migration_adds_standard_columns_idempotently(self):
        """A pre-fitting-library pipe_classes table gains both columns with ASME defaults."""
        from sqlalchemy import text, inspect
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM pipe_classes"))
            conn.execute(text("ALTER TABLE pipe_classes DROP COLUMN reducer_standard_code"))
            conn.execute(text("ALTER TABLE pipe_classes DROP COLUMN schedule_standard_code"))
            conn.execute(text(
                "INSERT INTO pipe_classes (id, code, name, standard, material_group, material_grade, rating_class, "
                "design_code, roughness_mm, corrosion_allowance_mm, revision, is_builtin, sizes_json) VALUES "
                "('legacy-id', 'LEGACY', 'Legacy', 'CUSTOM', 'CS', 'A106', 'CL150', 'ASME B31.3', 0.045, 0, '1.0', 0, '[]')"
            ))

        init_db()
        init_db()  # second run must be a no-op

        cols = [c["name"] for c in inspect(engine).get_columns("pipe_classes")]
        self.assertIn("reducer_standard_code", cols)
        self.assertIn("schedule_standard_code", cols)
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT reducer_standard_code, schedule_standard_code FROM pipe_classes WHERE code = 'LEGACY'"
            )).one()
        self.assertEqual(tuple(row), ("ASME_B16_9_REDUCERS", "ASME_B36_10M_SCHEDULES"))
