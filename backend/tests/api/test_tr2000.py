"""Code-review fixes: TR2000 request paths are validated, upstream errors are not echoed to the client."""
import pytest


import uuid

import pytest

from fastapi.testclient import TestClient

from main import app
from db.database import init_db, SessionLocal
from db.models import User
from auth import hash_password, create_access_token
from services import tr2000_service
from services.tr2000_service import _safe_segment


@pytest.mark.parametrize("value", ["AC140", "BSV1R-2", "1.0", "A B"])
def test_safe_segment_accepts_real_codes(value):
    assert _safe_segment(value, "x")


@pytest.mark.parametrize("value", ["../x", "a/b", "a?b", "..", ".", "", "a#b", "x" * 65])
def test_safe_segment_rejects_path_tricks(value):
    with pytest.raises(ValueError):
        _safe_segment(value, "x")


def test_sync_rejects_bad_code_and_hides_upstream_errors(monkeypatch):
    init_db()
    db = SessionLocal()
    u = User(username=f"pm_{uuid.uuid4().hex[:8]}", password_hash=hash_password("secret_pass_1"), role="pipe_manager", status="approved")
    db.add(u)
    db.commit()
    headers = {"Authorization": "Bearer " + create_access_token(data={"sub": u.id, "username": u.username, "role": u.role})}
    db.close()
    client = TestClient(app)
    body = {"pcs_code": "../admin", "agreed_to_terms": True}
    assert client.post("/api/pipe-classes/tr2000/sync", json=body, headers=headers).status_code == 400

    async def boom(path, client=None):
        raise RuntimeError("secret upstream detail 10.0.0.5")
    monkeypatch.setattr(tr2000_service, "_fetch_get", boom)
    r = client.post("/api/pipe-classes/tr2000/sync", json={"pcs_code": "AC140", "agreed_to_terms": True}, headers=headers)
    assert r.status_code == 502 and "10.0.0.5" not in r.text


# --- Normalization fixes (pipe class review) ---

from services.tr2000_service import _nps_to_dn, _map_schedule_standard, get_material_roughness_mm


@pytest.mark.parametrize("nom, dn", [("2", 50), ("2 1/2", 65), ("1/2", 15), ("44", 1100), ("4.5", 112), ("0.75", 20)])
def test_nps_to_dn(nom, dn):
    assert _nps_to_dn(nom) == dn


@pytest.mark.parametrize("nom", ["", "abc", "0", "-2"])
def test_unreadable_nominal_size_gives_no_dn(nom):
    assert _nps_to_dn(nom) == 0


@pytest.mark.parametrize("group, desc, eps", [
    ("CS", "", 0.045),
    ("316SS", "", 0.015),
    ("", "Stainless steel 316L", 0.015),
    ("", "Duplex 22Cr", 0.015),
    ("TI", "", 0.005),
    ("", "GRP plastics", 0.010),     # 'PLASTICS' must not match 'CS'
    ("", "Unobtainium", 0.045),
])
def test_material_roughness(group, desc, eps):
    assert get_material_roughness_mm(group, desc) == eps


def test_schedule_standard_follows_sizes():
    s_sizes = [{"sch": "10S"}, {"sch": "40S"}]
    mixed = [{"sch": "10S"}, {"sch": "80"}]
    assert _map_schedule_standard("ASME B31.3", s_sizes) == "ASME_B36_19M_SCHEDULES"
    assert _map_schedule_standard("ASME B31.3", mixed) == "ASME_B36_10M_SCHEDULES"
    assert _map_schedule_standard("EN 13480", s_sizes) == "DIN_EN_PIPE_SCHEDULES"


def test_normalized_pcs_keeps_rev_date_and_skips_unreadable_sizes(monkeypatch):
    import asyncio

    async def fake_get(path, client=None):
        if path.endswith("/pipe-sizes"):
            return {"getPipeSize": [
                {"NomSize": "2", "OuterDiam": 60.3, "WallThickness": 2.77, "Schedule": "10S"},
                {"NomSize": "n/a", "OuterDiam": 60.3, "WallThickness": 2.77, "Schedule": "10S"},
            ]}
        if path.endswith("/temp-pressures"):
            return {"getTempPressure": [{"Temperature": 20, "Pressure": 19.0}]}
        return {"getPCS": [{"PCS": "SS1", "Revision": "B", "RevDate": "2025-03-01", "MaterialGroup": "316SS",
                            "DesignCode": "ASME B31.3", "RatingClass": "CL150"}]}

    monkeypatch.setattr(tr2000_service, "_fetch_get", fake_get)
    pcs = asyncio.run(tr2000_service.fetch_and_normalize_tr2000_pcs(109, "SS1"))
    assert pcs["rev_date"] == "2025-03-01"
    assert [s["dn"] for s in pcs["sizes"]] == [50]
    assert pcs["schedule_standard_code"] == "ASME_B36_19M_SCHEDULES"


def test_sync_stores_catalog_references_and_custom_rows(monkeypatch):
    """Sizes with catalog dimensions become references (catalogs selected), odd walls custom rows."""
    init_db()
    db = SessionLocal()
    u = User(username=f"pm_{uuid.uuid4().hex[:8]}", password_hash=hash_password("secret_pass_1"), role="pipe_manager", status="approved")
    db.add(u)
    db.commit()
    headers = {"Authorization": "Bearer " + create_access_token(data={"sub": u.id, "username": u.username, "role": u.role})}
    db.close()

    async def fake_get(path, client=None):
        if path.endswith("/pipe-sizes"):
            return {"getPipeSize": [
                {"NomSize": "2", "OuterDiam": 60.3, "WallThickness": 2.77, "Schedule": "10S"},
                {"NomSize": "3", "OuterDiam": 88.9, "WallThickness": 5.49, "Schedule": "STD"},
                {"NomSize": "4", "OuterDiam": 114.3, "WallThickness": 4.5, "Schedule": "-"},
            ]}
        if path.endswith("/temp-pressures"):
            return {"getTempPressure": [{"Temperature": 20, "Pressure": 19.0}]}
        return {"getPCS": [{"PCS": "MIX1", "Revision": "A", "MaterialGroup": "CS",
                            "DesignCode": "ASME B31.3", "RatingClass": "CL150"}]}

    monkeypatch.setattr(tr2000_service, "_fetch_get", fake_get)
    code = f"MIX{uuid.uuid4().hex[:4]}".upper()
    r = TestClient(app).post("/api/pipe-classes/tr2000/sync",
                             json={"pcs_code": "MIX1", "custom_code": code, "agreed_to_terms": True}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["schedule_standard_codes"] == ["ASME_B36_10M_SCHEDULES", "ASME_B36_19M_SCHEDULES"]
    assert [s.get("catalog") for s in body["sizes"]] == ["ASME_B36_19M_SCHEDULES", "ASME_B36_10M_SCHEDULES", None]
    assert body["sizes"][2]["custom"] is True and body["sizes"][2]["wt_mm"] == 4.5
