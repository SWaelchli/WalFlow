import unittest
import json
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from db.database import init_db, engine, Base

import uuid

class TestAuthAndDiagrams(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_01_health_check(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "online")

    def test_02_register_and_login(self):
        username = f"user_{uuid.uuid4().hex[:8]}"
        password = "secret_password_123"

        # Register user
        reg_response = self.client.post("/api/auth/register", json={
            "username": username,
            "password": password
        })
        self.assertEqual(reg_response.status_code, 201)
        user_data = reg_response.json()
        self.assertEqual(user_data["username"], username)

        # Login user
        login_response = self.client.post("/api/auth/login", json={
            "username": username,
            "password": password
        })
        self.assertEqual(login_response.status_code, 200)
        token = login_response.json()["access_token"]
        self.assertTrue(token)

        # Fetch profile
        headers = {"Authorization": f"Bearer {token}"}
        me_response = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["username"], username)

        # Test Diagram CRUD
        sample_diagram = {
            "title": "Test Hydraulic Circuit",
            "description": "A test centrifugal pump loop",
            "diagram_data": json.dumps({"nodes": [{"id": "pump-1"}], "edges": []})
        }

        # 1. Create Diagram
        create_resp = self.client.post("/api/diagrams", json=sample_diagram, headers=headers)
        self.assertEqual(create_resp.status_code, 201)
        created_diagram = create_resp.json()
        diagram_id = created_diagram["id"]
        self.assertEqual(created_diagram["title"], "Test Hydraulic Circuit")

        # 2. List Diagrams
        list_resp = self.client.get("/api/diagrams", headers=headers)
        self.assertEqual(list_resp.status_code, 200)
        self.assertGreaterEqual(len(list_resp.json()), 1)

        # 3. Get Diagram Detail
        detail_resp = self.client.get(f"/api/diagrams/{diagram_id}", headers=headers)
        self.assertEqual(detail_resp.status_code, 200)
        self.assertEqual(detail_resp.json()["id"], diagram_id)

        # 4. Update Diagram
        update_resp = self.client.put(f"/api/diagrams/{diagram_id}", json={
            "title": "Updated Hydraulic Circuit"
        }, headers=headers)
        self.assertEqual(update_resp.status_code, 200)
        self.assertEqual(update_resp.json()["title"], "Updated Hydraulic Circuit")

        # 5. Delete Diagram
        delete_resp = self.client.delete(f"/api/diagrams/{diagram_id}", headers=headers)
        self.assertEqual(delete_resp.status_code, 200)

        # Confirm deletion
        detail_after = self.client.get(f"/api/diagrams/{diagram_id}", headers=headers)
        self.assertEqual(detail_after.status_code, 404)

if __name__ == "__main__":
    unittest.main()
