"""Seeded catalogue data against ASME B36.19M / B36.10M / DIN EN, and the example classes'
references into it. The catalogs live only in the database (seeded from `fitting_defaults.py`)."""


from services.fitting_defaults import DIN_EN_10253_2_REDUCERS_DATA, EXAMPLE_FITTING_STANDARDS
from services.pipe_class_defaults import EXAMPLE_PIPE_CLASSES
from services.pipe_class_catalog import resolve_sizes, size_errors

SEED_CATALOGS = {
    s["code"]: {row["dn"]: row for row in s["dimensions"]}
    for s in EXAMPLE_FITTING_STANDARDS if s["fitting_type"] == "pipe_schedule"
}
SEED_REDUCERS = {s["code"] for s in EXAMPLE_FITTING_STANDARDS if s["fitting_type"] == "reducer"}


def test_example_classes_reference_seeded_catalogs():
    for cls in EXAMPLE_PIPE_CLASSES:
        assert size_errors(cls["sizes"], cls["schedule_standard_codes"], SEED_CATALOGS) == [], cls["code"]
        assert set(cls["reducer_standard_codes"]) <= SEED_REDUCERS


def test_10s_walls_dn15_dn20_are_2_11_mm():
    found = []
    for cls in EXAMPLE_PIPE_CLASSES:
        for r in resolve_sizes(cls["sizes"], SEED_CATALOGS):
            if r["sch"] == "10S" and r["dn"] in (15, 20):
                found.append(r)
    assert found, "seed classes with 10S DN15/DN20 expected"
    for r in found:
        assert r["wt_mm"] == 2.11
        assert abs(r["id_mm"] - (r["od_mm"] - 2 * 2.11)) < 0.01


def test_s_schedule_seed_classes_use_b36_19m():
    for cls in EXAMPLE_PIPE_CLASSES:
        schedules = {row["sch"] for row in cls["sizes"]}
        if schedules <= {"5S", "10S", "40S", "80S"}:
            assert cls["schedule_standard_codes"] == ["ASME_B36_19M_SCHEDULES"], cls["code"]


def test_b36_10m_dn400_sch20_sch30():
    from services.fitting_defaults import PIPE_SCHEDULES_DATA
    dn400 = next(r for r in PIPE_SCHEDULES_DATA if r["dn"] == 400)["schedules"]
    assert dn400["20"]["wt_mm"] == 7.92 and dn400["30"]["wt_mm"] == 9.53


def test_b36_19m_bores_and_10s_walls():
    from services.fitting_defaults import PIPE_SCHEDULES_B36_19M_DATA
    for row in PIPE_SCHEDULES_B36_19M_DATA:
        assert set(row["schedules"]) <= {"5S", "10S", "40S", "80S"}
        for entry in row["schedules"].values():
            assert abs(entry["id_mm"] - (row["od_mm"] - 2 * entry["wt_mm"])) < 0.006
    by_dn = {r["dn"]: r["schedules"] for r in PIPE_SCHEDULES_B36_19M_DATA}
    assert by_dn[15]["10S"]["wt_mm"] == by_dn[20]["10S"]["wt_mm"] == 2.11


def test_din_reducer_seed_has_37_pairs():
    assert len(DIN_EN_10253_2_REDUCERS_DATA) == 37


def test_din_schedules_share_reducer_outside_diameters():
    """DIN EN reducers and DIN EN pipe dimensions use the same EN 10220 outside diameters."""
    from services.fitting_defaults import DIN_EN_PIPE_SCHEDULES_DATA
    od_by_dn = {row["dn"]: row["od_mm"] for row in DIN_EN_PIPE_SCHEDULES_DATA}
    for r in DIN_EN_10253_2_REDUCERS_DATA:
        assert od_by_dn[r["dn_large"]] == r["od_large_mm"]
        assert od_by_dn[r["dn_small"]] == r["od_small_mm"]


def test_din_schedule_walls_and_bores():
    from services.fitting_defaults import DIN_EN_PIPE_SCHEDULES_DATA
    for row in DIN_EN_PIPE_SCHEDULES_DATA:
        s = row["schedules"]
        assert s["ISO 1127"]["wt_mm"] < s["Normal"]["wt_mm"] < s["Heavy"]["wt_mm"]
        for entry in s.values():
            assert abs(entry["id_mm"] - (row["od_mm"] - 2 * entry["wt_mm"])) < 0.006
