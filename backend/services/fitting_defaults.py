"""
Default Built-in Fitting Standards for WalFlow

Defines standardized dimensional catalogs based on:
1. ASME B16.9 - Factory-Made Wrought Buttwelding Fittings (Concentric & Eccentric Reducers)
2. ASME B36.10M / ASME B36.19M - Standard Pipe Dimensions and Schedules
"""

import math

# Standard ASME B36.10M / B36.19M Outside Diameters & Schedule Wall Thicknesses (mm)
PIPE_SCHEDULES_DATA = [
    {
        "dn": 15, "nps": "1/2", "od_mm": 21.3,
        "schedules": {
            "STD": {"wt_mm": 2.77, "id_mm": 15.76},
            "40": {"wt_mm": 2.77, "id_mm": 15.76},
            "80": {"wt_mm": 3.73, "id_mm": 13.84},
            "XS": {"wt_mm": 3.73, "id_mm": 13.84},
            "160": {"wt_mm": 4.78, "id_mm": 11.74}
        }
    },
    {
        "dn": 20, "nps": "3/4", "od_mm": 26.7,
        "schedules": {
            "STD": {"wt_mm": 2.87, "id_mm": 20.96},
            "40": {"wt_mm": 2.87, "id_mm": 20.96},
            "80": {"wt_mm": 3.91, "id_mm": 18.88},
            "XS": {"wt_mm": 3.91, "id_mm": 18.88},
            "160": {"wt_mm": 5.56, "id_mm": 15.58}
        }
    },
    {
        "dn": 25, "nps": "1", "od_mm": 33.4,
        "schedules": {
            "STD": {"wt_mm": 3.38, "id_mm": 26.64},
            "40": {"wt_mm": 3.38, "id_mm": 26.64},
            "80": {"wt_mm": 4.55, "id_mm": 24.30},
            "XS": {"wt_mm": 4.55, "id_mm": 24.30},
            "160": {"wt_mm": 6.35, "id_mm": 20.70}
        }
    },
    {
        "dn": 32, "nps": "1 1/4", "od_mm": 42.2,
        "schedules": {
            "STD": {"wt_mm": 3.56, "id_mm": 35.08},
            "40": {"wt_mm": 3.56, "id_mm": 35.08},
            "80": {"wt_mm": 4.85, "id_mm": 32.50},
            "XS": {"wt_mm": 4.85, "id_mm": 32.50},
            "160": {"wt_mm": 6.35, "id_mm": 29.50}
        }
    },
    {
        "dn": 40, "nps": "1 1/2", "od_mm": 48.3,
        "schedules": {
            "STD": {"wt_mm": 3.68, "id_mm": 40.94},
            "40": {"wt_mm": 3.68, "id_mm": 40.94},
            "80": {"wt_mm": 5.08, "id_mm": 38.14},
            "XS": {"wt_mm": 5.08, "id_mm": 38.14},
            "160": {"wt_mm": 7.14, "id_mm": 34.02}
        }
    },
    {
        "dn": 50, "nps": "2", "od_mm": 60.3,
        "schedules": {
            "STD": {"wt_mm": 3.91, "id_mm": 52.48},
            "40": {"wt_mm": 3.91, "id_mm": 52.48},
            "80": {"wt_mm": 5.54, "id_mm": 49.22},
            "XS": {"wt_mm": 5.54, "id_mm": 49.22},
            "160": {"wt_mm": 8.74, "id_mm": 42.82}
        }
    },
    {
        "dn": 65, "nps": "2 1/2", "od_mm": 73.0,
        "schedules": {
            "STD": {"wt_mm": 5.16, "id_mm": 62.68},
            "40": {"wt_mm": 5.16, "id_mm": 62.68},
            "80": {"wt_mm": 7.01, "id_mm": 58.98},
            "XS": {"wt_mm": 7.01, "id_mm": 58.98},
            "160": {"wt_mm": 9.53, "id_mm": 53.94}
        }
    },
    {
        "dn": 80, "nps": "3", "od_mm": 88.9,
        "schedules": {
            "STD": {"wt_mm": 5.49, "id_mm": 77.92},
            "40": {"wt_mm": 5.49, "id_mm": 77.92},
            "80": {"wt_mm": 7.62, "id_mm": 73.66},
            "XS": {"wt_mm": 7.62, "id_mm": 73.66},
            "160": {"wt_mm": 11.13, "id_mm": 66.64}
        }
    },
    {
        "dn": 90, "nps": "3 1/2", "od_mm": 101.6,
        "schedules": {
            "STD": {"wt_mm": 5.74, "id_mm": 90.12},
            "40": {"wt_mm": 5.74, "id_mm": 90.12},
            "80": {"wt_mm": 8.08, "id_mm": 85.44},
            "XS": {"wt_mm": 8.08, "id_mm": 85.44}
        }
    },
    {
        "dn": 100, "nps": "4", "od_mm": 114.3,
        "schedules": {
            "STD": {"wt_mm": 6.02, "id_mm": 102.26},
            "40": {"wt_mm": 6.02, "id_mm": 102.26},
            "80": {"wt_mm": 8.56, "id_mm": 97.18},
            "XS": {"wt_mm": 8.56, "id_mm": 97.18},
            "160": {"wt_mm": 13.49, "id_mm": 87.32}
        }
    },
    {
        "dn": 125, "nps": "5", "od_mm": 141.3,
        "schedules": {
            "STD": {"wt_mm": 6.55, "id_mm": 128.20},
            "40": {"wt_mm": 6.55, "id_mm": 128.20},
            "80": {"wt_mm": 9.53, "id_mm": 122.24},
            "XS": {"wt_mm": 9.53, "id_mm": 122.24},
            "160": {"wt_mm": 15.88, "id_mm": 109.54}
        }
    },
    {
        "dn": 150, "nps": "6", "od_mm": 168.3,
        "schedules": {
            "STD": {"wt_mm": 7.11, "id_mm": 154.08},
            "40": {"wt_mm": 7.11, "id_mm": 154.08},
            "80": {"wt_mm": 10.97, "id_mm": 146.36},
            "XS": {"wt_mm": 10.97, "id_mm": 146.36},
            "160": {"wt_mm": 18.26, "id_mm": 131.78}
        }
    },
    {
        "dn": 200, "nps": "8", "od_mm": 219.1,
        "schedules": {
            "STD": {"wt_mm": 8.18, "id_mm": 202.74},
            "40": {"wt_mm": 8.18, "id_mm": 202.74},
            "80": {"wt_mm": 12.70, "id_mm": 193.70},
            "XS": {"wt_mm": 12.70, "id_mm": 193.70},
            "160": {"wt_mm": 23.01, "id_mm": 173.08}
        }
    },
    {
        "dn": 250, "nps": "10", "od_mm": 273.0,
        "schedules": {
            "STD": {"wt_mm": 9.27, "id_mm": 254.46},
            "40": {"wt_mm": 9.27, "id_mm": 254.46},
            "80": {"wt_mm": 15.09, "id_mm": 242.82},
            "XS": {"wt_mm": 12.70, "id_mm": 247.60},
            "160": {"wt_mm": 28.58, "id_mm": 215.84}
        }
    },
    {
        "dn": 300, "nps": "12", "od_mm": 323.8,
        "schedules": {
            "STD": {"wt_mm": 9.53, "id_mm": 304.74},
            "40": {"wt_mm": 10.31, "id_mm": 303.18},
            "80": {"wt_mm": 17.48, "id_mm": 288.84},
            "XS": {"wt_mm": 12.70, "id_mm": 298.40},
            "160": {"wt_mm": 33.32, "id_mm": 257.16}
        }
    },
    {
        "dn": 350, "nps": "14", "od_mm": 355.6,
        "schedules": {
            "STD": {"wt_mm": 9.53, "id_mm": 336.54},
            "40": {"wt_mm": 11.13, "id_mm": 333.34},
            "80": {"wt_mm": 19.05, "id_mm": 317.50},
            "XS": {"wt_mm": 12.70, "id_mm": 330.20}
        }
    },
    {
        "dn": 400, "nps": "16", "od_mm": 406.4,
        "schedules": {
            "STD": {"wt_mm": 9.53, "id_mm": 387.34},
            "40": {"wt_mm": 12.70, "id_mm": 381.00},
            "80": {"wt_mm": 21.44, "id_mm": 363.52},
            "XS": {"wt_mm": 12.70, "id_mm": 381.00}
        }
    },
    {
        "dn": 450, "nps": "18", "od_mm": 457.0,
        "schedules": {
            "STD": {"wt_mm": 9.53, "id_mm": 437.94},
            "40": {"wt_mm": 14.27, "id_mm": 428.46},
            "80": {"wt_mm": 23.83, "id_mm": 409.34},
            "XS": {"wt_mm": 12.70, "id_mm": 431.60}
        }
    },
    {
        "dn": 500, "nps": "20", "od_mm": 508.0,
        "schedules": {
            "STD": {"wt_mm": 9.53, "id_mm": 488.94},
            "40": {"wt_mm": 15.09, "id_mm": 477.82},
            "80": {"wt_mm": 26.19, "id_mm": 455.62},
            "XS": {"wt_mm": 12.70, "id_mm": 482.60}
        }
    },
    {
        "dn": 600, "nps": "24", "od_mm": 610.0,
        "schedules": {
            "STD": {"wt_mm": 9.53, "id_mm": 590.94},
            "40": {"wt_mm": 17.48, "id_mm": 575.04},
            "80": {"wt_mm": 30.96, "id_mm": 548.08},
            "XS": {"wt_mm": 12.70, "id_mm": 584.60}
        }
    }
]

# Helper lookup for OD by DN
_OD_MAP = {p["dn"]: p["od_mm"] for p in PIPE_SCHEDULES_DATA}

def _calc_cone_angle(od_large_mm: float, od_small_mm: float, length_mm: float) -> float:
    """Calculates total cone transition angle theta in degrees."""
    if length_mm <= 0:
        return 0.0
    half_angle_rad = math.atan((od_large_mm - od_small_mm) / (2.0 * length_mm))
    return round(math.degrees(2.0 * half_angle_rad), 2)

# Raw ASME B16.9 Reducer standard size pairs and length H (Table 11)
_REDUCER_RAW_TABLE = [
    # 3/4" large
    (20, "3/4", 15, "1/2", 38.0),
    # 1" large
    (25, "1", 20, "3/4", 51.0),
    (25, "1", 15, "1/2", 51.0),
    # 1 1/4" large
    (32, "1 1/4", 25, "1", 51.0),
    (32, "1 1/4", 20, "3/4", 51.0),
    (32, "1 1/4", 15, "1/2", 51.0),
    # 1 1/2" large
    (40, "1 1/2", 32, "1 1/4", 64.0),
    (40, "1 1/2", 25, "1", 64.0),
    (40, "1 1/2", 20, "3/4", 64.0),
    (40, "1 1/2", 15, "1/2", 64.0),
    # 2" large
    (50, "2", 40, "1 1/2", 76.0),
    (50, "2", 32, "1 1/4", 76.0),
    (50, "2", 25, "1", 76.0),
    (50, "2", 20, "3/4", 76.0),
    # 2 1/2" large
    (65, "2 1/2", 50, "2", 89.0),
    (65, "2 1/2", 40, "1 1/2", 89.0),
    (65, "2 1/2", 32, "1 1/4", 89.0),
    (65, "2 1/2", 25, "1", 89.0),
    # 3" large
    (80, "3", 65, "2 1/2", 89.0),
    (80, "3", 50, "2", 89.0),
    (80, "3", 40, "1 1/2", 89.0),
    (80, "3", 32, "1 1/4", 89.0),
    # 3 1/2" large
    (90, "3 1/2", 80, "3", 102.0),
    (90, "3 1/2", 65, "2 1/2", 102.0),
    (90, "3 1/2", 50, "2", 102.0),
    (90, "3 1/2", 40, "1 1/2", 102.0),
    # 4" large
    (100, "4", 90, "3 1/2", 102.0),
    (100, "4", 80, "3", 102.0),
    (100, "4", 65, "2 1/2", 102.0),
    (100, "4", 50, "2", 102.0),
    (100, "4", 40, "1 1/2", 102.0),
    # 5" large
    (125, "5", 100, "4", 127.0),
    (125, "5", 80, "3", 127.0),
    (125, "5", 65, "2 1/2", 127.0),
    (125, "5", 50, "2", 127.0),
    # 6" large
    (150, "6", 125, "5", 140.0),
    (150, "6", 100, "4", 140.0),
    (150, "6", 80, "3", 140.0),
    (150, "6", 65, "2 1/2", 140.0),
    # 8" large
    (200, "8", 150, "6", 152.0),
    (200, "8", 125, "5", 152.0),
    (200, "8", 100, "4", 152.0),
    (200, "8", 90, "3 1/2", 152.0),
    # 10" large
    (250, "10", 200, "8", 178.0),
    (250, "10", 150, "6", 178.0),
    (250, "10", 125, "5", 178.0),
    (250, "10", 100, "4", 178.0),
    # 12" large
    (300, "12", 250, "10", 203.0),
    (300, "12", 200, "8", 203.0),
    (300, "12", 150, "6", 203.0),
    (300, "12", 125, "5", 203.0),
    # 14" large
    (350, "14", 300, "12", 330.0),
    (350, "14", 250, "10", 330.0),
    (350, "14", 200, "8", 330.0),
    (350, "14", 150, "6", 330.0),
    # 16" large
    (400, "16", 350, "14", 356.0),
    (400, "16", 300, "12", 356.0),
    (400, "16", 250, "10", 356.0),
    (400, "16", 200, "8", 356.0),
    # 18" large
    (450, "18", 400, "16", 381.0),
    (450, "18", 350, "14", 381.0),
    (450, "18", 300, "12", 381.0),
    (450, "18", 250, "10", 381.0),
    # 20" large
    (500, "20", 450, "18", 508.0),
    (500, "20", 400, "16", 508.0),
    (500, "20", 350, "14", 508.0),
    (500, "20", 300, "12", 508.0),
    # 24" large
    (600, "24", 500, "20", 508.0),
    (600, "24", 450, "18", 508.0),
    (600, "24", 400, "16", 508.0),
    (600, "24", 350, "14", 508.0)
]

ASME_B16_9_REDUCERS_DATA = []
for dn_l, nps_l, dn_s, nps_s, len_h in _REDUCER_RAW_TABLE:
    od_l = _OD_MAP.get(dn_l, 0.0)
    od_s = _OD_MAP.get(dn_s, 0.0)
    cone_ang = _calc_cone_angle(od_l, od_s, len_h)
    ASME_B16_9_REDUCERS_DATA.append({
        "dn_large": dn_l,
        "nps_large": nps_l,
        "od_large_mm": od_l,
        "dn_small": dn_s,
        "nps_small": nps_s,
        "od_small_mm": od_s,
        "length_mm": len_h,
        "cone_angle_deg": cone_ang
    })

EXAMPLE_FITTING_STANDARDS = [
    {
        "id": "walflow-asme-b16-9-reducers",
        "code": "ASME_B16_9_REDUCERS",
        "name": "ASME B16.9 Buttweld Reducers",
        "standard": "ASME",
        "fitting_type": "reducer",
        "subtype": "concentric_eccentric",
        "description": "Factory-Made Wrought Buttwelding Concentric and Eccentric Reducers (ASME B16.9 Table 11)",
        "is_builtin": True,
        "dimensions": ASME_B16_9_REDUCERS_DATA
    },
    {
        "id": "walflow-asme-b36-10m-schedules",
        "code": "ASME_B36_10M_SCHEDULES",
        "name": "ASME B36.10M / B36.19M Pipe Schedules",
        "standard": "ASME",
        "fitting_type": "pipe_schedule",
        "subtype": "carbon_stainless_schedules",
        "description": "Welded and Seamless Wrought Steel and Stainless Steel Pipe Schedules (ASME B36.10M / B36.19M)",
        "is_builtin": True,
        "dimensions": PIPE_SCHEDULES_DATA
    }
]
