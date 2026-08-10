import unittest
import json
import os
import sys

# Ensure tests use an isolated test database
TEST_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_walflow.db")
os.environ["DATABASE_PATH"] = TEST_DB_PATH

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fastapi.testclient import TestClient
from main import app
from db.database import init_db, engine, Base

import uuid

class TestAuthAndDiagrams(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.drop_all(bind=engine)
        init_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except OSError:
                pass


    def test_01_health_check(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "online")

    def test_02_first_time_admin_setup(self):
        # 1. Admin status check
        status_resp = self.client.get("/api/auth/admin-status")
        self.assertEqual(status_resp.status_code, 200)
        self.assertFalse(status_resp.json()["admin_exists"])

        # 2. Setup first admin
        admin_uname = f"admin_{uuid.uuid4().hex[:8]}"
        admin_pass = "admin_secret_pass"
        admin_reg = self.client.post("/api/auth/setup-admin", json={
            "username": admin_uname,
            "password": admin_pass
        })
        self.assertEqual(admin_reg.status_code, 201)
        self.assertEqual(admin_reg.json()["role"], "admin")
        self.assertEqual(admin_reg.json()["status"], "approved")

        # 3. Second setup call should fail
        fail_reg = self.client.post("/api/auth/setup-admin", json={
            "username": "another_admin",
            "password": "pass"
        })
        self.assertEqual(fail_reg.status_code, 400)

        # 4. Admin login
        admin_login = self.client.post("/api/auth/login", json={
            "username": admin_uname,
            "password": admin_pass
        })
        self.assertEqual(admin_login.status_code, 200)
        self.admin_token = admin_login.json()["access_token"]
        TestAuthAndDiagrams.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}

    def test_03_registration_approval_backlog_and_admin_hub(self):
        # 1. Register standard user (should be pending_approval)
        user_uname = f"user_{uuid.uuid4().hex[:8]}"
        user_pass = "user_secret_pass"
        user_reg = self.client.post("/api/auth/register", json={
            "username": user_uname,
            "password": user_pass
        })
        self.assertEqual(user_reg.status_code, 201)
        self.assertEqual(user_reg.json()["status"], "pending_approval")
        pending_user_id = user_reg.json()["id"]

        # 2. Attempt login as pending user (should be 403 Forbidden)
        user_login_fail = self.client.post("/api/auth/login", json={
            "username": user_uname,
            "password": user_pass
        })
        self.assertEqual(user_login_fail.status_code, 403)
        self.assertIn("pending", user_login_fail.json()["detail"].lower())

        # 3. Admin inspects pending users backlog
        pending_list = self.client.get("/api/admin/pending-users", headers=self.admin_headers)
        self.assertEqual(pending_list.status_code, 200)
        pending_ids = [u["id"] for u in pending_list.json()]
        self.assertIn(pending_user_id, pending_ids)

        # 4. Admin approves pending user
        approve_resp = self.client.post(f"/api/admin/users/{pending_user_id}/approve", headers=self.admin_headers)
        self.assertEqual(approve_resp.status_code, 200)

        # 5. Now user can login
        user_login_success = self.client.post("/api/auth/login", json={
            "username": user_uname,
            "password": user_pass
        })
        self.assertEqual(user_login_success.status_code, 200)

        # 6. Test Database Inspector endpoint
        inspect_resp = self.client.get("/api/admin/database/inspect", headers=self.admin_headers)
        self.assertEqual(inspect_resp.status_code, 200)
        stats = inspect_resp.json()["stats"]
        self.assertGreaterEqual(stats["total_users"], 2)

    def test_04_diagram_crud(self):
        # Create an approved user for diagram CRUD tests
        username = f"user_{uuid.uuid4().hex[:8]}"
        password = "secret_password_123"

        reg_response = self.client.post("/api/auth/register", json={
            "username": username,
            "password": password
        })
        user_id = reg_response.json()["id"]

        # Approve user via admin
        self.client.post(f"/api/admin/users/{user_id}/approve", headers=self.admin_headers)

        # Login user
        login_response = self.client.post("/api/auth/login", json={
            "username": username,
            "password": password
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Diagram CRUD
        sample_diagram = {
            "title": "Test Hydraulic Circuit",
            "description": "A test centrifugal pump loop",
            "diagram_data": json.dumps({"nodes": [{"id": "pump-1"}], "edges": []})
        }

        create_resp = self.client.post("/api/diagrams", json=sample_diagram, headers=headers)
        self.assertEqual(create_resp.status_code, 201)
        created_diagram = create_resp.json()
        diagram_id = created_diagram["id"]

        list_resp = self.client.get("/api/diagrams", headers=headers)
        self.assertEqual(list_resp.status_code, 200)

        detail_resp = self.client.get(f"/api/diagrams/{diagram_id}", headers=headers)
        self.assertEqual(detail_resp.status_code, 200)

        update_resp = self.client.put(f"/api/diagrams/{diagram_id}", json={
            "title": "Updated Circuit"
        }, headers=headers)
        self.assertEqual(update_resp.status_code, 200)

        delete_resp = self.client.delete(f"/api/diagrams/{diagram_id}", headers=headers)
        self.assertEqual(delete_resp.status_code, 200)

    def test_05_secret_key_production_enforcement(self):
        import importlib
        import os
        import auth

        # Back up existing environment variables
        old_env = os.environ.get("ENVIRONMENT")
        old_key = os.environ.get("WALFLOW_SECRET_KEY")

        try:
            # Case 1: ENVIRONMENT=production, WALFLOW_SECRET_KEY is empty/unset
            os.environ["ENVIRONMENT"] = "production"
            if "WALFLOW_SECRET_KEY" in os.environ:
                del os.environ["WALFLOW_SECRET_KEY"]

            with self.assertRaises(ValueError) as context:
                importlib.reload(auth)
            self.assertIn("CRITICAL SECURITY ERROR", str(context.exception))

            # Case 2: ENVIRONMENT=production, WALFLOW_SECRET_KEY is set
            os.environ["WALFLOW_SECRET_KEY"] = "some_valid_production_secret"
            reloaded_auth = importlib.reload(auth)
            self.assertEqual(reloaded_auth.SECRET_KEY, "some_valid_production_secret")

            # Case 3: ENVIRONMENT=development, WALFLOW_SECRET_KEY is empty/unset
            os.environ["ENVIRONMENT"] = "development"
            del os.environ["WALFLOW_SECRET_KEY"]
            reloaded_auth = importlib.reload(auth)
            self.assertIsNotNone(reloaded_auth.SECRET_KEY)
            self.assertNotEqual(reloaded_auth.SECRET_KEY, "walflow_dev_secret_key_change_in_production_39a48f2b")
            self.assertEqual(len(reloaded_auth.SECRET_KEY), 64) # secrets.token_hex(32) produces 64 character hex string

        finally:
            # Restore environment
            if old_env is not None:
                os.environ["ENVIRONMENT"] = old_env
            elif "ENVIRONMENT" in os.environ:
                del os.environ["ENVIRONMENT"]

            if old_key is not None:
                os.environ["WALFLOW_SECRET_KEY"] = old_key
            elif "WALFLOW_SECRET_KEY" in os.environ:
                del os.environ["WALFLOW_SECRET_KEY"]

            # Reload auth one last time to restore normal state for other tests/modules
            importlib.reload(auth)

    def test_06_websocket_authentication_enforcement(self):
        import os
        from starlette.websockets import WebSocketDisconnect

        # Backup existing environment variables
        old_auth_req = os.environ.get("WALFLOW_REQUIRE_WS_AUTH")

        try:
            # Case 1: WALFLOW_REQUIRE_WS_AUTH is not set (should default to true)
            if "WALFLOW_REQUIRE_WS_AUTH" in os.environ:
                del os.environ["WALFLOW_REQUIRE_WS_AUTH"]

            # Unauthenticated connection should fail with close code 1008
            with self.assertRaises(WebSocketDisconnect) as context:
                with self.client.websocket_connect("/ws/simulate") as ws:
                    pass
            self.assertEqual(context.exception.code, 1008)

            # Case 2: WALFLOW_REQUIRE_WS_AUTH = "false" (explicitly disabled)
            os.environ["WALFLOW_REQUIRE_WS_AUTH"] = "false"
            with self.client.websocket_connect("/ws/simulate") as ws:
                # Successfully connected and did not raise exception
                pass

        finally:
            # Restore environment
            if old_auth_req is not None:
                os.environ["WALFLOW_REQUIRE_WS_AUTH"] = old_auth_req
            elif "WALFLOW_REQUIRE_WS_AUTH" in os.environ:
                del os.environ["WALFLOW_REQUIRE_WS_AUTH"]

if __name__ == "__main__":
    unittest.main()
