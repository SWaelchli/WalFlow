"""
Default Example Pipe Classes for WalFlow (Clean Installation Seed)

Defines 4 standard example pipe classes based on ASME B36.10M / ASME B36.19M pipe and
ASME B16.5 rating classes. Sizes reference the seeded schedule catalogs (`fitting_defaults.py`):
1. CS01 - Carbon Steel ASME 150# (ASTM A106 Gr. B)
2. SS01 - Stainless Steel 316L ASME 150# (ASTM A312 TP316L)
3. LT01 - Low-Temperature Carbon Steel ASME 300# (ASTM A333 Gr. 6)
4. DX01 - 22Cr Duplex Stainless Steel ASME 150# (UNS S31803 / 2205)
"""

EXAMPLE_PIPE_CLASSES = [
    {
        "id": "walflow-cs01",
        "code": "CS01",
        "name": "Carbon Steel ASME 150#",
        "standard": "WALFLOW_EXAMPLE",
        "material_group": "CS",
        "material_grade": "ASTM A106 Gr. B",
        "rating_class": "CL150",
        "design_code": "ASME B31.3",
        "roughness_mm": 0.045,
        "corrosion_allowance_mm": 3.0,
        "min_temp_c": -29.0,
        "max_temp_c": 200.0,
        "revision": "1.0",
        "rev_date": "2026-08-14",
        "source_plant_id": None,
        "reducer_standard_codes": ["ASME_B16_9_REDUCERS"],
        "schedule_standard_codes": ["ASME_B36_10M_SCHEDULES"],
        "is_builtin": True,

        "sizes": [
            {"dn": 15, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 1.5},
            {"dn": 20, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 1.5},
            {"dn": 25, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 1.5},
            {"dn": 32, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 1.5},
            {"dn": 40, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 1.5},
            {"dn": 50, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 65, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 80, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 100, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 125, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 150, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 200, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 250, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 300, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 350, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
            {"dn": 400, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0}
        ],
        "temp_pressures": [
            {"temp_c": -29.0, "press_bar": 19.6},
            {"temp_c": 38.0,  "press_bar": 19.6},
            {"temp_c": 50.0,  "press_bar": 19.2},
            {"temp_c": 100.0, "press_bar": 17.7},
            {"temp_c": 150.0, "press_bar": 15.8},
            {"temp_c": 200.0, "press_bar": 13.8}
        ]
    },
    {
        "id": "walflow-ss01",
        "code": "SS01",
        "name": "Stainless Steel 316L ASME 150#",
        "standard": "WALFLOW_EXAMPLE",
        "material_group": "316SS",
        "material_grade": "ASTM A312 TP316/316L",
        "rating_class": "CL150",
        "design_code": "ASME B31.3",
        "roughness_mm": 0.015,
        "corrosion_allowance_mm": 0.0,
        "min_temp_c": -196.0,
        "max_temp_c": 200.0,
        "revision": "1.0",
        "rev_date": "2026-08-14",
        "source_plant_id": None,
        "reducer_standard_codes": ["ASME_B16_9_REDUCERS"],
        "schedule_standard_codes": ["ASME_B36_19M_SCHEDULES"],
        "is_builtin": True,
        "sizes": [
            {"dn": 15, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 20, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 25, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 32, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 40, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 50, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 65, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 80, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 100, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 150, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 200, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 250, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 300, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0}
        ],
        "temp_pressures": [
            {"temp_c": -196.0,"press_bar": 19.0},
            {"temp_c": 38.0,  "press_bar": 19.0},
            {"temp_c": 50.0,  "press_bar": 18.2},
            {"temp_c": 100.0, "press_bar": 16.2},
            {"temp_c": 150.0, "press_bar": 14.8},
            {"temp_c": 200.0, "press_bar": 13.7}
        ]
    },
    {
        "id": "walflow-lt01",
        "code": "LT01",
        "name": "Low-Temp Carbon Steel ASME 300#",
        "standard": "WALFLOW_EXAMPLE",
        "material_group": "CSLT",
        "material_grade": "ASTM A333 Gr. 6",
        "rating_class": "CL300",
        "design_code": "ASME B31.3",
        "roughness_mm": 0.045,
        "corrosion_allowance_mm": 3.0,
        "min_temp_c": -46.0,
        "max_temp_c": 200.0,
        "revision": "1.0",
        "rev_date": "2026-08-14",
        "source_plant_id": None,
        "reducer_standard_codes": ["ASME_B16_9_REDUCERS"],
        "schedule_standard_codes": ["ASME_B36_10M_SCHEDULES"],
        "is_builtin": True,
        "sizes": [
            {"dn": 15, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 1.5},
            {"dn": 20, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 1.5},
            {"dn": 25, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 1.5},
            {"dn": 32, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 1.5},
            {"dn": 40, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 1.5},
            {"dn": 50, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 3.0},
            {"dn": 65, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 3.0},
            {"dn": 80, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 3.0},
            {"dn": 100, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 3.0},
            {"dn": 150, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 3.0},
            {"dn": 200, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 3.0},
            {"dn": 250, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 3.0},
            {"dn": 300, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "80", "ca_mm": 3.0}
        ],
        "temp_pressures": [
            {"temp_c": -46.0, "press_bar": 51.1},
            {"temp_c": 38.0,  "press_bar": 51.1},
            {"temp_c": 50.0,  "press_bar": 50.1},
            {"temp_c": 100.0, "press_bar": 46.6},
            {"temp_c": 150.0, "press_bar": 45.1},
            {"temp_c": 200.0, "press_bar": 43.8}
        ]
    },
    {
        "id": "walflow-dx01",
        "code": "DX01",
        "name": "22Cr Duplex Stainless ASME 150#",
        "standard": "WALFLOW_EXAMPLE",
        "material_group": "DX",
        "material_grade": "UNS S31803 / 2205",
        "rating_class": "CL150",
        "design_code": "ASME B31.3",
        "roughness_mm": 0.015,
        "corrosion_allowance_mm": 0.0,
        "min_temp_c": -46.0,
        "max_temp_c": 250.0,
        "revision": "1.0",
        "rev_date": "2026-08-14",
        "source_plant_id": None,
        "reducer_standard_codes": ["ASME_B16_9_REDUCERS"],
        "schedule_standard_codes": ["ASME_B36_19M_SCHEDULES"],
        "is_builtin": True,

        "sizes": [
            {"dn": 15, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 20, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 25, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 32, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 40, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 50, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 65, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 80, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 100, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 150, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 200, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 250, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0},
            {"dn": 300, "catalog": "ASME_B36_19M_SCHEDULES", "sch": "10S", "ca_mm": 0.0}
        ],
        "temp_pressures": [
            {"temp_c": -46.0, "press_bar": 20.0},
            {"temp_c": 38.0,  "press_bar": 20.0},
            {"temp_c": 50.0,  "press_bar": 19.5},
            {"temp_c": 100.0, "press_bar": 17.7},
            {"temp_c": 150.0, "press_bar": 15.8},
            {"temp_c": 200.0, "press_bar": 13.8},
            {"temp_c": 250.0, "press_bar": 12.1}
        ]
    }
]


def example_to_pipe_class(raw):
    """Builds the PipeClass row for an example class (same row for startup seeding and /seed-examples)."""
    import json
    from db.models import PipeClass

    return PipeClass(
        id=raw["id"],
        code=raw["code"],
        name=raw["name"],
        standard=raw["standard"],
        material_group=raw["material_group"],
        material_grade=raw["material_grade"],
        rating_class=raw["rating_class"],
        design_code=raw["design_code"],
        reducer_standard_code=raw["reducer_standard_codes"][0],
        schedule_standard_code=raw["schedule_standard_codes"][0],
        reducer_standard_codes=json.dumps(raw["reducer_standard_codes"]),
        schedule_standard_codes=json.dumps(raw["schedule_standard_codes"]),
        roughness_mm=raw["roughness_mm"],
        corrosion_allowance_mm=raw["corrosion_allowance_mm"],
        min_temp_c=raw.get("min_temp_c"),
        max_temp_c=raw.get("max_temp_c"),
        revision=raw.get("revision", "1.0"),
        rev_date=raw.get("rev_date"),
        source_plant_id=raw.get("source_plant_id"),
        is_builtin=raw.get("is_builtin", True),
        sizes_json=json.dumps(raw["sizes"]),
        temp_pressures_json=json.dumps(raw.get("temp_pressures", [])),
    )
