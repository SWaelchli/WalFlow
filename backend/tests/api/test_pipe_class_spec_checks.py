"""Pipe classes: size rows as catalog references, P-T checks, delete cleanup of project allow-lists, seeding, migration."""
import json
import uuid

import pytest

from fastapi.testclient import TestClient

from main import app
from db.database import init_db, engine, Base, SessionLocal
from db.models import User, PipeClass, Project, FittingStandard
from auth import hash_password, create_access_token

pytestmark = pytest.mark.audit("pipe-class-review")

B10 = "ASME_B36_10M_SCHEDULES"
B19 = "ASME_B36_19M_SCHEDULES"


@pytest.fixture
def client():
    Base.metadata.drop_all(bind=engine)
    init_db()
    return TestClient(app)


def _headers(role):
    db = SessionLocal()
    u = User(username=f"{role}_{uuid.uuid4().hex[:8]}", password_hash=hash_password("secret_pass_1"),
             role=role, status="approved")
    db.add(u)
    db.commit()
    token = create_access_token(data={"sub": u.id})
    db.close()
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mgr_headers(client):
    return _headers("pipe_manager")


@pytest.fixture
def admin_headers(client):
    return _headers("admin")


def _class(code="T01", sizes=None, **extra):
    body = {
        "code": code, "name": "Test", "material_group": "CS", "material_grade": "A106 B", "rating_class": "CL150",
        "sizes": sizes or [{"dn": 50, "catalog": B10, "sch": "STD"}],
    }
    body.update(extra)
    return body


# --- size rows reference the class's schedule catalogs ---

def test_duplicate_dn_is_rejected(client, mgr_headers):
    sizes = [{"dn": 50, "catalog": B10, "sch": "STD"}] * 2
    r = client.post("/api/pipe-classes", json=_class(sizes=sizes), headers=mgr_headers)
    assert r.status_code == 400 and "DN50 is listed more than once" in r.text


def test_reference_is_stored_and_resolved_from_the_catalog(client, mgr_headers):
    r = client.post("/api/pipe-classes", json=_class(sizes=[{"dn": 50, "catalog": B10, "sch": "STD", "ca_mm": 1.5}]),
                    headers=mgr_headers)
    assert r.status_code == 201, r.text
    size = r.json()["sizes"][0]
    assert (size["od_mm"], size["wt_mm"], size["id_mm"], size["nps"]) == (60.3, 3.91, 52.48, "2")
    db = SessionLocal()
    try:
        stored = json.loads(db.query(PipeClass).filter(PipeClass.code == "T01").first().sizes_json)
    finally:
        db.close()
    assert stored == [{"dn": 50, "catalog": B10, "sch": "STD", "ca_mm": 1.5}]


def test_schedule_of_an_unselected_catalog_is_rejected(client, mgr_headers):
    """A B36.19M class does not offer B36.10M schedules unless that catalog is selected too."""
    r = client.post("/api/pipe-classes", json=_class(schedule_standard_codes=[B19]), headers=mgr_headers)
    assert r.status_code == 400 and "is not selected for this class" in r.text
    r = client.post("/api/pipe-classes", json=_class(sizes=[{"dn": 50, "catalog": B19, "sch": "STD"}],
                                                     schedule_standard_codes=[B19]), headers=mgr_headers)
    assert r.status_code == 400 and "'STD' is not listed in ASME_B36_19M_SCHEDULES" in r.text


def test_class_with_two_catalogs_mixes_their_schedules(client, mgr_headers):
    """Duplex small bore Sch 160 next to 10S: both catalogs selected."""
    sizes = [{"dn": 15, "catalog": B10, "sch": "160"}, {"dn": 50, "catalog": B19, "sch": "10S"}]
    r = client.post("/api/pipe-classes", json=_class(sizes=sizes, schedule_standard_codes=[B19, B10]), headers=mgr_headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["schedule_standard_codes"] == [B19, B10] and body["schedule_standard_code"] == B19
    assert [s["wt_mm"] for s in body["sizes"]] == [4.78, 2.77]


def test_dn_not_in_the_catalog_is_rejected_unless_custom(client, mgr_headers):
    r = client.post("/api/pipe-classes", json=_class(sizes=[{"dn": 1100, "catalog": B10, "sch": "XS"}]), headers=mgr_headers)
    assert r.status_code == 400 and "DN1100 is not listed" in r.text
    custom = [{"dn": 1100, "custom": True, "nps": "44", "od_mm": 1117.6, "wt_mm": 12.7, "sch": "XS"}]
    r = client.post("/api/pipe-classes", json=_class(sizes=custom), headers=mgr_headers)
    assert r.status_code == 201, r.text
    assert r.json()["sizes"][0]["custom"] is True and r.json()["sizes"][0]["id_mm"] == 1092.2


def test_custom_row_needs_od_above_twice_the_wall(client, mgr_headers):
    custom = [{"dn": 1100, "custom": True, "nps": "44", "od_mm": 20.0, "wt_mm": 12.7}]
    r = client.post("/api/pipe-classes", json=_class(sizes=custom), headers=mgr_headers)
    assert r.status_code == 400 and "OD must be greater than 2" in r.text


def test_dimensioned_rows_from_older_clients_are_matched(client, mgr_headers):
    r = client.post("/api/pipe-classes", json=_class(sizes=[{"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 3.91, "sch": "STD"}]),
                    headers=mgr_headers)
    assert r.status_code == 201, r.text
    assert r.json()["sizes"][0]["catalog"] == B10
    # EN 10220 OD for DN65 in an ASME class: no catalog row, so it must be marked custom
    r = client.post("/api/pipe-classes", json=_class(code="T02", sizes=[{"dn": 65, "nps": "2 1/2", "od_mm": 76.1, "wt_mm": 5.16}]),
                    headers=mgr_headers)
    assert r.status_code == 400 and "mark the size as custom" in r.text


def test_deselecting_a_catalog_in_use_is_rejected(client, mgr_headers):
    r = client.put("/api/pipe-classes/CS01", json={"schedule_standard_codes": ["DIN_EN_PIPE_SCHEDULES"]}, headers=mgr_headers)
    assert r.status_code == 400 and "is not selected for this class" in r.text


def test_unknown_or_wrong_type_catalog_is_rejected(client, mgr_headers):
    r = client.post("/api/pipe-classes", json=_class(schedule_standard_codes=["NOPE"]), headers=mgr_headers)
    assert r.status_code == 400 and "'NOPE' does not exist" in r.text
    r = client.post("/api/pipe-classes", json=_class(reducer_standard_codes=[B10]), headers=mgr_headers)
    assert r.status_code == 400 and "expected 'reducer'" in r.text


def test_catalog_value_change_reaches_the_class(client, admin_headers):
    std = client.get(f"/api/fitting-standards/{B10}").json()
    for row in std["dimensions"]:
        if row["dn"] == 50:
            row["schedules"]["STD"] = {"wt_mm": 4.0, "id_mm": 52.3}
    r = client.put(f"/api/fitting-standards/{B10}", json={"dimensions": std["dimensions"]}, headers=admin_headers)
    assert r.status_code == 200, r.text
    dn50 = next(s for s in client.get("/api/pipe-classes/CS01").json()["sizes"] if s["dn"] == 50)
    assert dn50["wt_mm"] == 4.0 and dn50["id_mm"] == 52.3


def test_catalog_cannot_drop_a_size_in_use(client, admin_headers):
    std = client.get(f"/api/fitting-standards/{B10}").json()
    dims = [r for r in std["dimensions"] if r["dn"] != 50]
    r = client.put(f"/api/fitting-standards/{B10}", json={"dimensions": dims}, headers=admin_headers)
    assert r.status_code == 409 and "CS01 uses DN50 STD" in r.text


def test_restore_builtins_cannot_drop_a_size_in_use(client, mgr_headers, admin_headers):
    # A class uses a schedule that only exists in the edited built-in, not in the factory data
    db = SessionLocal()
    std = db.query(FittingStandard).filter(FittingStandard.code == B19).first()
    rows = json.loads(std.dimensions_json)
    next(r for r in rows if r["dn"] == 50)["schedules"]["120S"] = {"wt_mm": 7.0, "id_mm": 46.3}
    std.dimensions_json = json.dumps(rows)
    db.commit()
    db.close()
    r = client.post("/api/pipe-classes", json=_class(sizes=[{"dn": 50, "catalog": B19, "sch": "120S"}],
                                                     schedule_standard_codes=[B19]), headers=mgr_headers)
    assert r.status_code == 201, r.text
    r = client.post("/api/fitting-standards/seed-defaults?restore_builtins=true", headers=admin_headers)
    assert r.status_code == 409 and "T01 uses DN50 120S" in r.text


def test_library_import_turns_dimensions_into_references(client, mgr_headers):
    old = _class(code="IMP01", sizes=[
        {"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 2.77, "sch": "10S"},
        {"dn": 80, "nps": "3", "od_mm": 88.9, "wt_mm": 5.49, "sch": "STD"},
        {"dn": 100, "nps": "4", "od_mm": 114.3, "wt_mm": 4.5, "sch": "odd"},
    ], schedule_standard_code=B10)
    r = client.post("/api/pipe-classes/import/library", json={"classes": [old]}, headers=mgr_headers)
    assert r.json()["imported"] == ["IMP01"], r.text
    body = client.get("/api/pipe-classes/IMP01").json()
    assert body["schedule_standard_codes"] == [B10, B19]
    assert [s.get("catalog") for s in body["sizes"]] == [B19, B10, None]
    assert body["sizes"][2]["custom"] is True


def test_library_import_reports_invalid_sizes(client, mgr_headers):
    bad = _class(code="IMP02", sizes=[{"dn": 50, "catalog": B10, "sch": "Normal"}])
    r = client.post("/api/pipe-classes/import/library", json={"classes": [bad]}, headers=mgr_headers)
    assert r.json()["imported"] == []
    assert "'Normal' is not listed" in r.json()["invalid_entries"][0]["reason"]


# --- P-T curve and design temperatures ---

def test_temp_pressures_are_stored_sorted(client, mgr_headers):
    tp = [{"temp_c": 100, "press_bar": 17.7}, {"temp_c": -29, "press_bar": 19.6}]
    r = client.post("/api/pipe-classes", json=_class(temp_pressures=tp, min_temp_c=-29, max_temp_c=100), headers=mgr_headers)
    assert r.status_code == 201, r.text
    assert [p["temp_c"] for p in r.json()["temp_pressures"]] == [-29, 100]


@pytest.mark.parametrize("tp, tmin, tmax, message", [
    ([{"temp_c": 38, "press_bar": 19.6}, {"temp_c": 38, "press_bar": 19.0}], None, None, "same temperature"),
    ([], 200, -29, "is above the maximum"),
    ([{"temp_c": -29, "press_bar": 19.6}, {"temp_c": 200, "press_bar": 13.8}], -46, 200, "below the P-T curve"),
    ([{"temp_c": -29, "press_bar": 19.6}, {"temp_c": 200, "press_bar": 13.8}], -29, 250, "above the P-T curve"),
])
def test_inconsistent_temperatures_are_rejected(client, mgr_headers, tp, tmin, tmax, message):
    r = client.post("/api/pipe-classes", json=_class(temp_pressures=tp, min_temp_c=tmin, max_temp_c=tmax), headers=mgr_headers)
    assert r.status_code == 400 and message in r.text


def test_update_checks_temperature_limit_against_stored_curve(client, mgr_headers):
    # CS01 curve runs -29 .. 200 degC
    r = client.put("/api/pipe-classes/CS01", json={"max_temp_c": 250}, headers=mgr_headers)
    assert r.status_code == 400 and "above the P-T curve" in r.text


# --- delete removes the class from project allow-lists ---

def test_delete_strips_id_and_code_from_project_allow_lists(client, mgr_headers):
    db = SessionLocal()
    by_id = Project(title="ids", allowed_pipe_classes=json.dumps(["walflow-cs01", "walflow-ss01"]))
    by_code = Project(title="codes", allowed_pipe_classes=json.dumps(["CS01", "LT01"]))
    unrestricted = Project(title="all", allowed_pipe_classes=None)
    db.add_all([by_id, by_code, unrestricted])
    db.commit()
    ids = (by_id.id, by_code.id, unrestricted.id)
    db.close()

    assert client.delete("/api/pipe-classes/CS01", headers=mgr_headers).status_code == 204

    db = SessionLocal()
    try:
        allowed = {p.id: p.allowed_pipe_classes for p in db.query(Project).filter(Project.id.in_(ids))}
    finally:
        db.close()
    assert json.loads(allowed[ids[0]]) == ["walflow-ss01"]
    assert json.loads(allowed[ids[1]]) == ["LT01"]
    assert allowed[ids[2]] is None


# --- seeding and migration ---

def test_deleted_example_is_not_reseeded_at_startup(client, mgr_headers):
    assert client.delete("/api/pipe-classes/DX01", headers=mgr_headers).status_code == 204
    init_db()
    assert client.get("/api/pipe-classes/DX01").status_code == 404


def test_seed_examples_matches_startup_seed(client, mgr_headers):
    startup = client.get("/api/pipe-classes/SS01").json()
    assert client.delete("/api/pipe-classes/SS01", headers=mgr_headers).status_code == 204
    assert "SS01" in client.post("/api/pipe-classes/seed-examples", headers=mgr_headers).json()["created"]
    restored = client.get("/api/pipe-classes/SS01").json()
    for key in ("is_builtin", "reducer_standard_codes", "schedule_standard_codes", "material_grade", "sizes"):
        assert restored[key] == startup[key]
    assert restored["is_builtin"] is True


def test_stainless_examples_reference_b36_19m(client):
    for code in ("SS01", "DX01"):
        assert client.get(f"/api/pipe-classes/{code}").json()["schedule_standard_codes"] == [B19]
    assert client.get("/api/pipe-classes/CS01").json()["schedule_standard_codes"] == [B10]


def _legacy_class(code, schedule_code, sizes):
    """A class as stored before size rows referenced the catalog."""
    return PipeClass(code=code, name=code, standard="CUSTOM", material_group="CS", material_grade="g",
                     rating_class="CL150", design_code="ASME B31.3", schedule_standard_code=schedule_code,
                     reducer_standard_code="ASME_B16_9_REDUCERS", sizes_json=json.dumps(sizes))


def test_migration_turns_stored_dimensions_into_references(client):
    db = SessionLocal()
    db.add_all([
        _legacy_class("OLD_SS", B10, [{"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 2.77, "sch": "10S", "ca_mm": 0}]),
        _legacy_class("OLD_MIX", B10, [
            {"dn": 50, "nps": "2", "od_mm": 60.3, "wt_mm": 2.77, "sch": "10S", "ca_mm": 0},
            {"dn": 80, "nps": "3", "od_mm": 88.9, "wt_mm": 5.49, "sch": "STD", "ca_mm": 3},
            {"dn": 100, "nps": "4", "od_mm": 114.3, "wt_mm": 4.5, "sch": "odd", "ca_mm": 0},
        ]),
    ])
    db.commit()
    db.close()
    init_db()
    init_db()  # idempotent
    ss = client.get("/api/pipe-classes/OLD_SS").json()
    assert ss["schedule_standard_codes"] == [B19] and ss["sizes"][0]["catalog"] == B19
    mix = client.get("/api/pipe-classes/OLD_MIX").json()
    assert mix["schedule_standard_codes"] == [B10, B19]
    assert [s.get("catalog") for s in mix["sizes"]] == [B19, B10, None]
    assert mix["sizes"][2]["custom"] is True and mix["sizes"][1]["ca_mm"] == 3


def test_builtin_schedule_standard_gains_missing_rows_without_overwriting(client):
    db = SessionLocal()
    std = db.query(FittingStandard).filter(FittingStandard.code == B10).first()
    rows = json.loads(std.dimensions_json)
    # Simulate an older install: no Sch 20 at DN400, a locally adjusted STD wall at DN50, DN600 missing
    for row in rows:
        if row["dn"] == 400:
            row["schedules"].pop("20")
        if row["dn"] == 50:
            row["schedules"]["STD"]["wt_mm"] = 3.90
    rows = [r for r in rows if r["dn"] != 600]
    std.dimensions_json = json.dumps(rows)
    std.name = "ASME B36.10M / B36.19M Pipe Schedules"
    db.commit()
    db.close()

    init_db()
    std = client.get(f"/api/fitting-standards/{B10}").json()
    by_dn = {r["dn"]: r for r in std["dimensions"]}
    assert by_dn[400]["schedules"]["20"]["wt_mm"] == 7.92
    assert by_dn[50]["schedules"]["STD"]["wt_mm"] == 3.90
    assert 600 in by_dn
    assert std["name"] == "ASME B36.10M Pipe Schedules"
