import unittest



from fastapi.testclient import TestClient
from main import app
from db.database import init_db, engine, Base, SessionLocal
from db.models import User
from auth import hash_password, create_access_token


class TestFittingStandardsDatabase(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        init_db()
        self.client = TestClient(app)

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

            self.admin_token = create_access_token(data={"sub": admin.id})
            self.pipemgr_token = create_access_token(data={"sub": pipe_mgr.id})
            self.user_token = create_access_token(data={"sub": regular.id})

        finally:
            db.close()

    def test_01_seed_defaults_present(self):
        """Verifies default fitting standards are automatically seeded."""
        res = self.client.get("/api/fitting-standards")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreaterEqual(len(data), 2)

        codes = [item["code"] for item in data]
        self.assertIn("ASME_B16_9_REDUCERS", codes)
        self.assertIn("ASME_B36_10M_SCHEDULES", codes)
        self.assertIn("DIN_EN_PIPE_SCHEDULES", codes)

    def test_01b_din_schedules_usable_by_pipe_class(self):
        """The DIN EN schedule standard is a pipe_schedule standard a pipe class can reference."""
        res = self.client.get("/api/fitting-standards?fitting_type=pipe_schedule")
        self.assertEqual(res.status_code, 200)
        din = next(item for item in res.json() if item["code"] == "DIN_EN_PIPE_SCHEDULES")
        dn50 = next(row for row in din["dimensions"] if row["dn"] == 50)
        self.assertEqual(dn50["od_mm"], 60.3)
        self.assertEqual(set(dn50["schedules"]), {"Normal", "Heavy", "ISO 1127"})

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

    def test_15_schedule_edit_recomputes_inside_diameter(self):
        """Saved schedule rows carry ID = OD - 2 WT whatever ID the client sent, sorted by DN."""
        headers = {"Authorization": f"Bearer {self.pipemgr_token}"}
        res = self.client.post("/api/fitting-standards", json={
            "code": "SCH_EDIT", "name": "Schedule edit", "fitting_type": "pipe_schedule",
            "dimensions": [
                {"dn": 80, "nps": "3", "od_mm": 88.9, "schedules": {"STD": {"wt_mm": 5.49, "id_mm": 1.0}}},
                {"dn": 50, "nps": "2", "od_mm": 60.3, "schedules": {"STD": {"wt_mm": 3.91}}},
            ]
        }, headers=headers)
        self.assertEqual(res.status_code, 201, res.text)
        rows = res.json()["dimensions"]
        self.assertEqual([r["dn"] for r in rows], [50, 80])
        self.assertAlmostEqual(rows[0]["schedules"]["STD"]["id_mm"], 52.48, places=3)
        self.assertAlmostEqual(rows[1]["schedules"]["STD"]["id_mm"], 77.92, places=3)

        # Changing the OD moves the ID along
        rows[0]["od_mm"] = 60.0
        upd = self.client.put("/api/fitting-standards/SCH_EDIT", json={"dimensions": rows}, headers=headers)
        self.assertEqual(upd.status_code, 200, upd.text)
        self.assertAlmostEqual(upd.json()["dimensions"][0]["schedules"]["STD"]["id_mm"], 52.18, places=3)

    def test_16_schedule_rows_are_validated(self):
        headers = {"Authorization": f"Bearer {self.pipemgr_token}"}
        base = {"code": "SCH_BAD", "name": "Bad", "fitting_type": "pipe_schedule"}
        cases = [
            ([{"dn": 50, "od_mm": 60.3, "schedules": {"STD": {"wt_mm": 31}}}], "less than half the OD"),
            ([{"dn": 50, "od_mm": 60.3, "schedules": {}}, {"dn": 50, "od_mm": 60.3, "schedules": {}}], "more than once"),
            ([{"dn": 50, "schedules": {}}], "numeric dn and od_mm"),
            # NaN / infinity used to slip past the comparisons and crash the duplicate check (HTTP 500)
            ([{"dn": "nan", "od_mm": 60.3, "schedules": {}}], "numeric dn and od_mm"),
            ([{"dn": "inf", "od_mm": 60.3, "schedules": {}}], "numeric dn and od_mm"),
            ([{"dn": 50, "od_mm": 60.3, "schedules": {"STD": {"wt_mm": "nan"}}}], "wt_mm must be a number"),
            # A fractional DN used to be truncated silently
            ([{"dn": 50.5, "od_mm": 60.3, "schedules": {}}], "whole number"),
        ]
        for dims, message in cases:
            res = self.client.post("/api/fitting-standards", json={**base, "dimensions": dims}, headers=headers)
            self.assertEqual(res.status_code, 400, dims)
            self.assertIn(message, res.json()["detail"])

    def test_17_reducer_edit_recomputes_cone_angle(self):
        """Cone angle = 2 atan((OD_L - OD_S) / 2L); DN80x50, L=89: (88.9-60.3)/178 -> 18.26 deg."""
        headers = {"Authorization": f"Bearer {self.pipemgr_token}"}
        res = self.client.post("/api/fitting-standards", json={
            "code": "RED_EDIT", "name": "Reducer edit", "fitting_type": "reducer",
            "dimensions": [{"dn_large": 80, "od_large_mm": 88.9, "dn_small": 50, "od_small_mm": 60.3,
                            "length_mm": 89, "cone_angle_deg": 99}]
        }, headers=headers)
        self.assertEqual(res.status_code, 201, res.text)
        self.assertAlmostEqual(res.json()["dimensions"][0]["cone_angle_deg"], 18.26, places=2)

    def test_18_reducer_rows_are_validated(self):
        """The server enforces the same reducer rules as the editor: OD order and unique DN pairs."""
        headers = {"Authorization": f"Bearer {self.pipemgr_token}"}
        base = {"code": "RED_BAD", "name": "Bad", "fitting_type": "reducer"}
        row = {"dn_large": 80, "od_large_mm": 88.9, "dn_small": 50, "od_small_mm": 60.3, "length_mm": 89}
        cases = [
            ([{**row, "od_large_mm": 50.0}], "od_large_mm (50) must exceed od_small_mm"),
            ([row, dict(row)], "DN80 x DN50 listed more than once"),
            ([{**row, "length_mm": "nan"}], "numeric dn_large, dn_small and length_mm"),
        ]
        for dims, message in cases:
            res = self.client.post("/api/fitting-standards", json={**base, "dimensions": dims}, headers=headers)
            self.assertEqual(res.status_code, 400, dims)
            self.assertIn(message, res.json()["detail"])

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

    # --- Control valve style catalogues (D-29b) ---

    def test_21_control_valve_catalogue_seeded_public_and_protected(self):
        """The IEC style catalogue is a public built-in: admin-only edit, no delete, clone gives an editable copy."""
        res = self.client.get("/api/fitting-standards?fitting_type=control_valve")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([item["code"] for item in res.json()], ["IEC_60534_2_1_TABLE_D2"])
        iec = res.json()[0]
        self.assertTrue(iec["is_builtin"])
        self.assertEqual(len(iec["dimensions"]), 28)
        self.assertNotIn("IEC_60534_2_1_TABLE_D2", [i["code"] for i in self.client.get("/api/fitting-standards?fitting_type=reducer").json()])

        mgr = {"Authorization": f"Bearer {self.pipemgr_token}"}
        admin = {"Authorization": f"Bearer {self.admin_token}"}
        url = "/api/fitting-standards/IEC_60534_2_1_TABLE_D2"
        self.assertEqual(self.client.put(url, json={"name": "X"}, headers=mgr).status_code, 403)
        self.assertEqual(self.client.put(url, json={"name": "Edited"}, headers=admin).status_code, 200)
        self.assertEqual(self.client.delete(url, headers=admin).status_code, 403)

        clone = self.client.post(f"{url}/clone", json={"new_code": "MY_STYLES"}, headers=mgr)
        self.assertEqual(clone.status_code, 201, clone.text)
        self.assertFalse(clone.json()["is_builtin"])
        self.assertEqual(clone.json()["fitting_type"], "control_valve")
        self.assertEqual(clone.json()["dimensions"], iec["dimensions"])

    def test_22_control_valve_styles_create_edit_and_normalise(self):
        headers = {"Authorization": f"Bearer {self.pipemgr_token}"}
        row = {"code": "  my_plug ", "valve_type": "Globe, single port", "trim": "Custom", "flow_direction": "Open",
               "fl": "0.88", "fd": 0.5, "xt": ""}
        res = self.client.post("/api/fitting-standards", json={
            "code": "VALVES_A", "name": "Mine", "fitting_type": "control_valve", "dimensions": [row]}, headers=headers)
        self.assertEqual(res.status_code, 201, res.text)
        saved = res.json()["dimensions"][0]
        self.assertEqual((saved["code"], saved["fl"], saved["fd"], saved["xt"]), ("my_plug", 0.88, 0.5, None))

        upd = self.client.put("/api/fitting-standards/VALVES_A", headers=headers, json={
            "dimensions": [{**row, "code": "plug2", "xt": "0.7", "fl": 1.0}]})
        self.assertEqual(upd.status_code, 200, upd.text)
        self.assertEqual((upd.json()["dimensions"][0]["xt"], upd.json()["dimensions"][0]["fl"]), (0.7, 1.0))

        # The row rules also apply on edit
        bad = self.client.put("/api/fitting-standards/VALVES_A", json={"dimensions": [{**row, "fl": 0}]}, headers=headers)
        self.assertEqual(bad.status_code, 400)

    def test_23_control_valve_rows_are_validated(self):
        headers = {"Authorization": f"Bearer {self.pipemgr_token}"}
        base = {"code": "VALVES_BAD", "name": "Bad", "fitting_type": "control_valve"}
        row = {"code": "a", "valve_type": "Globe", "fl": 0.9, "fd": 0.46, "xt": 0.7}
        cases = [
            ([{**row, "fl": 0}], "F_L must be above 0 and at most 1"),
            ([{**row, "fl": 1.01}], "F_L must be above 0 and at most 1"),
            ([{**row, "fl": "nan"}], "F_L must be above 0 and at most 1"),
            ([{**row, "fd": 0}], "F_d must be above 0"),
            ([{**row, "fd": -0.1}], "F_d must be above 0"),
            ([{**row, "xt": 1.5}], "x_T must be above 0 and at most 1"),
            ([{**row, "xt": 0}], "x_T must be above 0 and at most 1"),
            ([{**row, "code": "a:b"}], "without ':'"),
            ([{**row, "code": " "}], "without ':'"),
            ([{**row, "code": "c" * 51}], "without ':'"),
            ([{**row, "valve_type": ""}], "'valve_type' is required"),
            ([row, {**row, "code": " a "}], "Style code a listed more than once"),
        ]
        for dims, message in cases:
            res = self.client.post("/api/fitting-standards", json={**base, "dimensions": dims}, headers=headers)
            self.assertEqual(res.status_code, 400, dims)
            self.assertIn(message, res.json()["detail"])
        self.assertEqual(self.client.get("/api/fitting-standards/VALVES_BAD").status_code, 404)

    def test_24_control_valve_catalogue_survives_export_and_import(self):
        admin = {"Authorization": f"Bearer {self.admin_token}"}
        row = {"code": "r1", "valve_type": "Ball", "trim": "T", "flow_direction": "Either", "fl": 0.74, "fd": 0.99, "xt": None}
        self.client.post("/api/fitting-standards", json={
            "code": "VALVES_RT", "name": "Round trip", "fitting_type": "control_valve", "dimensions": [row]}, headers=admin)
        catalog = self.client.get("/api/fitting-standards/export-library").json()
        exported = {c["code"]: c for c in catalog}
        self.assertEqual(exported["IEC_60534_2_1_TABLE_D2"]["fitting_type"], "control_valve")
        self.assertEqual(exported["VALVES_RT"]["dimensions"], [row])

        self.assertEqual(self.client.delete("/api/fitting-standards/VALVES_RT", headers=admin).status_code, 200)
        imp = self.client.post("/api/fitting-standards/import-library", json=catalog, headers=admin)
        self.assertEqual(imp.status_code, 200, imp.text)
        back = self.client.get("/api/fitting-standards/VALVES_RT").json()
        self.assertEqual((back["fitting_type"], back["dimensions"]), ("control_valve", [row]))

        # An invalid control valve row rejects the whole import
        bad = [{"code": "VALVES_X", "fitting_type": "control_valve", "dimensions": [{**row, "fl": 2}]}]
        self.assertEqual(self.client.post("/api/fitting-standards/import-library", json=bad, headers=admin).status_code, 400)

    def test_25_restore_builtins_resets_edited_control_valve_catalogue(self):
        admin = {"Authorization": f"Bearer {self.admin_token}"}
        url = "/api/fitting-standards/IEC_60534_2_1_TABLE_D2"
        original = self.client.get(url).json()["dimensions"]
        self.assertEqual(self.client.put(url, json={"dimensions": original[:1]}, headers=admin).status_code, 200)
        self.assertEqual(self.client.post("/api/fitting-standards/seed-defaults?restore_builtins=true", headers=admin).status_code, 200)
        self.assertEqual(self.client.get(url).json()["dimensions"], original)
