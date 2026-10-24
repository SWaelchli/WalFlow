"""
Built-in control valve style catalogue: typical F_L, F_d and x_T at rated travel from
IEC 60534-2-1:2011 Table D.2 (read as DIN EN 60534-2-1:2012-01), English IEC terms.

Values are typical; the standard defers to manufacturer data. Left out: the tapered needle
(F_d is a formula of C, not a value) and the multistage rows (no F_d), since the Annex A
Reynolds number factor needs F_d. Rows giving the same values for both flow directions are one row.
Flow direction (Table D.2 footnotes b, c): flow to open / to close = the flow pushes the plug away from /
towards the seat; flow out / in through cage = from the inside of the cage outwards / from outside inwards.
"""

IEC_60534_TABLE_D2_CODE = "IEC_60534_2_1_TABLE_D2"

# (row code, valve type, trim, flow direction, F_L, x_T, F_d)
_TABLE_D2_ROWS = [
    ("globe_single_3v_port", "Globe, single port", "3 V-port plug", "Either direction", 0.9, 0.70, 0.48),
    ("globe_single_4v_port", "Globe, single port", "4 V-port plug", "Either direction", 0.9, 0.70, 0.41),
    ("globe_single_6v_port", "Globe, single port", "6 V-port plug", "Either direction", 0.9, 0.70, 0.30),
    ("globe_single_contoured_open", "Globe, single port", "Contoured plug (linear and equal percentage)", "Flow to open", 0.9, 0.72, 0.46),
    ("globe_single_contoured_close", "Globe, single port", "Contoured plug (linear and equal percentage)", "Flow to close", 0.8, 0.55, 1.00),
    ("globe_single_cage_60_holes", "Globe, single port", "60 equal-diameter-hole drilled cage", "Either direction", 0.9, 0.68, 0.13),
    ("globe_single_cage_120_holes", "Globe, single port", "120 equal-diameter-hole drilled cage", "Either direction", 0.9, 0.68, 0.09),
    ("globe_single_char_cage_outward", "Globe, single port", "Characterized cage, 4-port", "Flow out through cage", 0.9, 0.75, 0.41),
    ("globe_single_char_cage_inward", "Globe, single port", "Characterized cage, 4-port", "Flow in through cage", 0.85, 0.70, 0.41),
    ("globe_double_ported_plug", "Globe, double port", "Ported plug", "Inlet between seats", 0.9, 0.75, 0.28),
    ("globe_double_contoured", "Globe, double port", "Contoured plug", "Either direction", 0.85, 0.70, 0.32),
    ("angle_contoured_open", "Globe, angle", "Contoured plug (linear and equal percentage)", "Flow to open", 0.9, 0.72, 0.46),
    ("angle_contoured_close", "Globe, angle", "Contoured plug (linear and equal percentage)", "Flow to close", 0.8, 0.65, 1.00),
    ("angle_char_cage_outward", "Globe, angle", "Characterized cage, 4-port", "Flow out through cage", 0.9, 0.65, 0.41),
    ("angle_char_cage_inward", "Globe, angle", "Characterized cage, 4-port", "Flow in through cage", 0.85, 0.60, 0.41),
    ("angle_venturi", "Globe, angle", "Venturi", "Flow to close", 0.5, 0.20, 1.00),
    ("small_flow_v_notch", "Globe, small flow trim", "V-notch", "Flow to open", 0.98, 0.84, 0.70),
    ("small_flow_flat_seat", "Globe, small flow trim", "Flat seat (short travel)", "Flow to close", 0.85, 0.70, 0.30),
    ("rotary_eccentric_spherical_open", "Rotary", "Eccentric spherical plug", "Flow to open", 0.85, 0.60, 0.42),
    ("rotary_eccentric_spherical_close", "Rotary", "Eccentric spherical plug", "Flow to close", 0.68, 0.40, 0.42),
    ("rotary_eccentric_conical_open", "Rotary", "Eccentric conical plug", "Flow to open", 0.77, 0.54, 0.44),
    ("rotary_eccentric_conical_close", "Rotary", "Eccentric conical plug", "Flow to close", 0.79, 0.55, 0.44),
    ("butterfly_centred_swing_70", "Butterfly (centred shaft)", "Swing-through (70°)", "Either direction", 0.62, 0.35, 0.57),
    ("butterfly_centred_swing_60", "Butterfly (centred shaft)", "Swing-through (60°)", "Either direction", 0.70, 0.42, 0.50),
    ("butterfly_centred_fluted_70", "Butterfly (centred shaft)", "Fluted vane (70°)", "Either direction", 0.67, 0.38, 0.30),
    ("butterfly_eccentric_offset_70", "Butterfly (eccentric shaft)", "Offset seat (70°)", "Either direction", 0.67, 0.35, 0.57),
    ("ball_full_bore_70", "Ball", "Full bore (70°)", "Either direction", 0.74, 0.42, 0.99),
    ("ball_segmented", "Ball", "Segmented ball", "Either direction", 0.60, 0.30, 0.98),
]

IEC_60534_TABLE_D2_DATA = [
    {"code": code, "valve_type": vtype, "trim": trim, "flow_direction": direction, "fl": fl, "xt": xt, "fd": fd}
    for code, vtype, trim, direction, fl, xt, fd in _TABLE_D2_ROWS
]

# Default style of a new control valve; matches the backend defaults fl = 0.9, fd = 0.46
DEFAULT_VALVE_STYLE_ID = f"{IEC_60534_TABLE_D2_CODE}:globe_single_contoured_open"

EXAMPLE_VALVE_STYLE_CATALOGUES = [
    {
        "id": "walflow-iec-60534-2-1-table-d2",
        "code": IEC_60534_TABLE_D2_CODE,
        "name": "IEC 60534-2-1 Typical Valve Style Factors",
        "standard": "IEC",
        "fitting_type": "control_valve",
        "subtype": None,
        "description": "Typical F_L, F_d and x_T at rated travel (IEC 60534-2-1:2011 Table D.2). Manufacturer data takes precedence.",
        "is_builtin": True,
        "dimensions": IEC_60534_TABLE_D2_DATA,
    },
]
