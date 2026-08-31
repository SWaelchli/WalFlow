"""
Default Example Pipe Classes for WalFlow (Clean Installation Seed)

Defines 4 standard example industrial piping specifications based on
ASME B36.10M / ASME B36.19M and ASME B16.5 rating classes:
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
        "reducer_standard_code": "ASME_B16_9_REDUCERS",
        "schedule_standard_code": "ASME_B36_10M_SCHEDULES",
        "is_builtin": True,

        "sizes": [
            {"dn": 15,  "nps": "1/2",   "od_mm": 21.3,  "wt_mm": 2.77, "id_mm": 15.76, "sch": "STD", "ca_mm": 1.5},
            {"dn": 20,  "nps": "3/4",   "od_mm": 26.7,  "wt_mm": 2.87, "id_mm": 20.96, "sch": "STD", "ca_mm": 1.5},
            {"dn": 25,  "nps": "1",     "od_mm": 33.4,  "wt_mm": 3.38, "id_mm": 26.64, "sch": "STD", "ca_mm": 1.5},
            {"dn": 32,  "nps": "1 1/4", "od_mm": 42.2,  "wt_mm": 3.56, "id_mm": 35.08, "sch": "STD", "ca_mm": 1.5},
            {"dn": 40,  "nps": "1 1/2", "od_mm": 48.3,  "wt_mm": 3.68, "id_mm": 40.94, "sch": "STD", "ca_mm": 1.5},
            {"dn": 50,  "nps": "2",     "od_mm": 60.3,  "wt_mm": 3.91, "id_mm": 52.48, "sch": "STD", "ca_mm": 3.0},
            {"dn": 65,  "nps": "2 1/2", "od_mm": 73.0,  "wt_mm": 5.16, "id_mm": 62.68, "sch": "STD", "ca_mm": 3.0},
            {"dn": 80,  "nps": "3",     "od_mm": 88.9,  "wt_mm": 5.49, "id_mm": 77.92, "sch": "STD", "ca_mm": 3.0},
            {"dn": 100, "nps": "4",     "od_mm": 114.3, "wt_mm": 6.02, "id_mm": 102.26,"sch": "STD", "ca_mm": 3.0},
            {"dn": 125, "nps": "5",     "od_mm": 141.3, "wt_mm": 6.55, "id_mm": 128.20,"sch": "STD", "ca_mm": 3.0},
            {"dn": 150, "nps": "6",     "od_mm": 168.3, "wt_mm": 7.11, "id_mm": 154.08,"sch": "STD", "ca_mm": 3.0},
            {"dn": 200, "nps": "8",     "od_mm": 219.1, "wt_mm": 8.18, "id_mm": 202.74,"sch": "STD", "ca_mm": 3.0},
            {"dn": 250, "nps": "10",    "od_mm": 273.0, "wt_mm": 9.27, "id_mm": 254.46,"sch": "STD", "ca_mm": 3.0},
            {"dn": 300, "nps": "12",    "od_mm": 323.8, "wt_mm": 9.53, "id_mm": 304.74,"sch": "STD", "ca_mm": 3.0},
            {"dn": 350, "nps": "14",    "od_mm": 355.6, "wt_mm": 9.53, "id_mm": 336.54,"sch": "STD", "ca_mm": 3.0},
            {"dn": 400, "nps": "16",    "od_mm": 406.4, "wt_mm": 9.53, "id_mm": 387.34,"sch": "STD", "ca_mm": 3.0}
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
        "material_grade": "ASTM A312 TP316L",
        "rating_class": "CL150",
        "design_code": "ASME B31.3",
        "roughness_mm": 0.015,
        "corrosion_allowance_mm": 0.0,
        "min_temp_c": -196.0,
        "max_temp_c": 200.0,
        "revision": "1.0",
        "rev_date": "2026-08-14",
        "source_plant_id": None,
        "reducer_standard_code": "ASME_B16_9_REDUCERS",
        "schedule_standard_code": "ASME_B36_10M_SCHEDULES",
        "is_builtin": True,
        "sizes": [
            {"dn": 15,  "nps": "1/2",   "od_mm": 21.3,  "wt_mm": 1.65, "id_mm": 18.00, "sch": "10S", "ca_mm": 0.0},
            {"dn": 20,  "nps": "3/4",   "od_mm": 26.7,  "wt_mm": 1.65, "id_mm": 23.40, "sch": "10S", "ca_mm": 0.0},
            {"dn": 25,  "nps": "1",     "od_mm": 33.4,  "wt_mm": 2.77, "id_mm": 27.86, "sch": "10S", "ca_mm": 0.0},
            {"dn": 32,  "nps": "1 1/4", "od_mm": 42.2,  "wt_mm": 2.77, "id_mm": 36.66, "sch": "10S", "ca_mm": 0.0},
            {"dn": 40,  "nps": "1 1/2", "od_mm": 48.3,  "wt_mm": 2.77, "id_mm": 42.76, "sch": "10S", "ca_mm": 0.0},
            {"dn": 50,  "nps": "2",     "od_mm": 60.3,  "wt_mm": 2.77, "id_mm": 54.76, "sch": "10S", "ca_mm": 0.0},
            {"dn": 65,  "nps": "2 1/2", "od_mm": 73.0,  "wt_mm": 3.05, "id_mm": 66.90, "sch": "10S", "ca_mm": 0.0},
            {"dn": 80,  "nps": "3",     "od_mm": 88.9,  "wt_mm": 3.05, "id_mm": 82.80, "sch": "10S", "ca_mm": 0.0},
            {"dn": 100, "nps": "4",     "od_mm": 114.3, "wt_mm": 3.05, "id_mm": 108.20,"sch": "10S", "ca_mm": 0.0},
            {"dn": 150, "nps": "6",     "od_mm": 168.3, "wt_mm": 3.40, "id_mm": 161.50,"sch": "10S", "ca_mm": 0.0},
            {"dn": 200, "nps": "8",     "od_mm": 219.1, "wt_mm": 3.76, "id_mm": 211.58,"sch": "10S", "ca_mm": 0.0},
            {"dn": 250, "nps": "10",    "od_mm": 273.0, "wt_mm": 4.19, "id_mm": 264.62,"sch": "10S", "ca_mm": 0.0},
            {"dn": 300, "nps": "12",    "od_mm": 323.8, "wt_mm": 4.57, "id_mm": 314.66,"sch": "10S", "ca_mm": 0.0}
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
        "reducer_standard_code": "ASME_B16_9_REDUCERS",
        "schedule_standard_code": "ASME_B36_10M_SCHEDULES",
        "is_builtin": True,
        "sizes": [
            {"dn": 15,  "nps": "1/2",   "od_mm": 21.3,  "wt_mm": 3.73, "id_mm": 13.84, "sch": "80",  "ca_mm": 1.5},
            {"dn": 20,  "nps": "3/4",   "od_mm": 26.7,  "wt_mm": 3.91, "id_mm": 18.88, "sch": "80",  "ca_mm": 1.5},
            {"dn": 25,  "nps": "1",     "od_mm": 33.4,  "wt_mm": 4.55, "id_mm": 24.30, "sch": "80",  "ca_mm": 1.5},
            {"dn": 32,  "nps": "1 1/4", "od_mm": 42.2,  "wt_mm": 4.85, "id_mm": 32.50, "sch": "80",  "ca_mm": 1.5},
            {"dn": 40,  "nps": "1 1/2", "od_mm": 48.3,  "wt_mm": 5.08, "id_mm": 38.14, "sch": "80",  "ca_mm": 1.5},
            {"dn": 50,  "nps": "2",     "od_mm": 60.3,  "wt_mm": 5.54, "id_mm": 49.22, "sch": "80",  "ca_mm": 3.0},
            {"dn": 65,  "nps": "2 1/2", "od_mm": 73.0,  "wt_mm": 7.01, "id_mm": 58.98, "sch": "80",  "ca_mm": 3.0},
            {"dn": 80,  "nps": "3",     "od_mm": 88.9,  "wt_mm": 7.62, "id_mm": 73.66, "sch": "80",  "ca_mm": 3.0},
            {"dn": 100, "nps": "4",     "od_mm": 114.3, "wt_mm": 8.56, "id_mm": 97.18, "sch": "80",  "ca_mm": 3.0},
            {"dn": 150, "nps": "6",     "od_mm": 168.3, "wt_mm": 10.97,"id_mm": 146.36,"sch": "80",  "ca_mm": 3.0},
            {"dn": 200, "nps": "8",     "od_mm": 219.1, "wt_mm": 12.70,"id_mm": 193.70,"sch": "80",  "ca_mm": 3.0},
            {"dn": 250, "nps": "10",    "od_mm": 273.0, "wt_mm": 15.09,"id_mm": 242.82,"sch": "80",  "ca_mm": 3.0},
            {"dn": 300, "nps": "12",    "od_mm": 323.8, "wt_mm": 17.48,"id_mm": 288.84,"sch": "80",  "ca_mm": 3.0}
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
        "reducer_standard_code": "ASME_B16_9_REDUCERS",
        "schedule_standard_code": "ASME_B36_10M_SCHEDULES",
        "is_builtin": True,

        "sizes": [
            {"dn": 15,  "nps": "1/2",   "od_mm": 21.3,  "wt_mm": 1.65, "id_mm": 18.00, "sch": "10S", "ca_mm": 0.0},
            {"dn": 20,  "nps": "3/4",   "od_mm": 26.7,  "wt_mm": 1.65, "id_mm": 23.40, "sch": "10S", "ca_mm": 0.0},
            {"dn": 25,  "nps": "1",     "od_mm": 33.4,  "wt_mm": 2.77, "id_mm": 27.86, "sch": "10S", "ca_mm": 0.0},
            {"dn": 32,  "nps": "1 1/4", "od_mm": 42.2,  "wt_mm": 2.77, "id_mm": 36.66, "sch": "10S", "ca_mm": 0.0},
            {"dn": 40,  "nps": "1 1/2", "od_mm": 48.3,  "wt_mm": 2.77, "id_mm": 42.76, "sch": "10S", "ca_mm": 0.0},
            {"dn": 50,  "nps": "2",     "od_mm": 60.3,  "wt_mm": 2.77, "id_mm": 54.76, "sch": "10S", "ca_mm": 0.0},
            {"dn": 65,  "nps": "2 1/2", "od_mm": 73.0,  "wt_mm": 3.05, "id_mm": 66.90, "sch": "10S", "ca_mm": 0.0},
            {"dn": 80,  "nps": "3",     "od_mm": 88.9,  "wt_mm": 3.05, "id_mm": 82.80, "sch": "10S", "ca_mm": 0.0},
            {"dn": 100, "nps": "4",     "od_mm": 114.3, "wt_mm": 3.05, "id_mm": 108.20,"sch": "10S", "ca_mm": 0.0},
            {"dn": 150, "nps": "6",     "od_mm": 168.3, "wt_mm": 3.40, "id_mm": 161.50,"sch": "10S", "ca_mm": 0.0},
            {"dn": 200, "nps": "8",     "od_mm": 219.1, "wt_mm": 3.76, "id_mm": 211.58,"sch": "10S", "ca_mm": 0.0},
            {"dn": 250, "nps": "10",    "od_mm": 273.0, "wt_mm": 4.19, "id_mm": 264.62,"sch": "10S", "ca_mm": 0.0},
            {"dn": 300, "nps": "12",    "od_mm": 323.8, "wt_mm": 4.57, "id_mm": 314.66,"sch": "10S", "ca_mm": 0.0}
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
