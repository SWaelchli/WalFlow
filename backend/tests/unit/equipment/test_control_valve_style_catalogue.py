"""Seeded control valve style catalogue against IEC 60534-2-1:2011 Table D.2 (DIN EN 60534-2-1:2012-01),
typical F_L / x_T / F_d at rated travel (D-29b)."""
import pytest

pytestmark = pytest.mark.audit("D-29b")

from services.valve_style_defaults import (
    DEFAULT_VALVE_STYLE_ID, EXAMPLE_VALVE_STYLE_CATALOGUES, IEC_60534_TABLE_D2_CODE)
from strategies import build

# row code -> (F_L, x_T, F_d), transcribed from the standard's table
TABLE_D2 = {
    "globe_single_3v_port": (0.9, 0.70, 0.48),
    "globe_single_4v_port": (0.9, 0.70, 0.41),
    "globe_single_6v_port": (0.9, 0.70, 0.30),
    "globe_single_contoured_open": (0.9, 0.72, 0.46),
    "globe_single_contoured_close": (0.8, 0.55, 1.00),
    "globe_single_cage_60_holes": (0.9, 0.68, 0.13),
    "globe_single_cage_120_holes": (0.9, 0.68, 0.09),
    "globe_single_char_cage_outward": (0.9, 0.75, 0.41),
    "globe_single_char_cage_inward": (0.85, 0.70, 0.41),
    "globe_double_ported_plug": (0.9, 0.75, 0.28),
    "globe_double_contoured": (0.85, 0.70, 0.32),
    "angle_contoured_open": (0.9, 0.72, 0.46),
    "angle_contoured_close": (0.8, 0.65, 1.00),
    "angle_char_cage_outward": (0.9, 0.65, 0.41),
    "angle_char_cage_inward": (0.85, 0.60, 0.41),
    "angle_venturi": (0.5, 0.20, 1.00),
    "small_flow_v_notch": (0.98, 0.84, 0.70),
    "small_flow_flat_seat": (0.85, 0.70, 0.30),
    "rotary_eccentric_spherical_open": (0.85, 0.60, 0.42),
    "rotary_eccentric_spherical_close": (0.68, 0.40, 0.42),
    "rotary_eccentric_conical_open": (0.77, 0.54, 0.44),
    "rotary_eccentric_conical_close": (0.79, 0.55, 0.44),
    "butterfly_centred_swing_70": (0.62, 0.35, 0.57),
    "butterfly_centred_swing_60": (0.70, 0.42, 0.50),
    "butterfly_centred_fluted_70": (0.67, 0.38, 0.30),
    "butterfly_eccentric_offset_70": (0.67, 0.35, 0.57),
    "ball_full_bore_70": (0.74, 0.42, 0.99),
    "ball_segmented": (0.60, 0.30, 0.98),
}

ROWS = {row["code"]: row for row in EXAMPLE_VALVE_STYLE_CATALOGUES[0]["dimensions"]}


def test_catalogue_is_one_builtin_iec_control_valve_standard():
    assert [(c["code"], c["fitting_type"], c["standard"], c["is_builtin"]) for c in EXAMPLE_VALVE_STYLE_CATALOGUES] == [
        (IEC_60534_TABLE_D2_CODE, "control_valve", "IEC", True)]


def test_catalogue_has_exactly_the_table_rows():
    """No tapered needle (F_d is a formula) and no multistage rows (no F_d) slipped in, none dropped."""
    assert set(ROWS) == set(TABLE_D2)
    assert len(EXAMPLE_VALVE_STYLE_CATALOGUES[0]["dimensions"]) == len(ROWS)


def test_flow_directions_use_the_unambiguous_wording():
    """'Open' / 'Close' alone read as valve position; the direction is that of the flow (footnotes b, c)."""
    assert {r["flow_direction"] for r in ROWS.values()} == {
        "Flow to open", "Flow to close", "Either direction",
        "Flow out through cage", "Flow in through cage", "Inlet between seats"}


@pytest.mark.parametrize("code", sorted(TABLE_D2))
def test_row_matches_table_d2(code):
    fl, xt, fd = TABLE_D2[code]
    row = ROWS[code]
    assert (row["fl"], row["xt"], row["fd"]) == (fl, xt, fd)
    assert row["valve_type"] and row["trim"] and row["flow_direction"]


@pytest.mark.parametrize("code", sorted(TABLE_D2))
def test_row_is_accepted_by_the_parser(code):
    """A style picked from the catalogue must never make the simulation refuse the valve (ModelInputError)."""
    row = ROWS[code]
    valve = build("linear_control_valve", {"max_cv": 5.0, "fl": row["fl"], "fd": row["fd"]})
    assert (valve.fl, valve.fd) == (row["fl"], row["fd"])


def test_default_style_equals_backend_valve_defaults():
    catalogue, code = DEFAULT_VALVE_STYLE_ID.split(":")
    assert catalogue == IEC_60534_TABLE_D2_CODE
    default = build("linear_control_valve", {"max_cv": 5.0})
    assert (ROWS[code]["fl"], ROWS[code]["fd"]) == (default.fl, default.fd) == (0.9, 0.46)
