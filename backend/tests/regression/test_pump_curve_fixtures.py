"""The pump-chart formulas in the frontend (utils/pumpCurves.js) repeat the pump models. This test pins the
fixture file the frontend test checks against, so a change to either side fails a test. Regenerate with
`WALFLOW_WRITE_FIXTURES=1 pytest tests/test_pump_curve_fixtures.py`."""
from walflow_paths import FRONTEND_SRC
import pytest


import json
import os

from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.volumetric_pump import VolumetricPump

PATH = os.path.join(FRONTEND_SRC, "utils", "pumpCurves.fixtures.json")
FRACTIONS = [0.0, 0.25, 0.5, 0.9, 1.0, 1.2]


def build():
    centrifugal = []
    for flow_lmin, head, rise, rho in ((100.0, 50.0, 20.0, 1000.0), (250.0, 30.0, 15.0, 850.0)):
        pump = CentrifugalPump("c", flow_rated=flow_lmin / 60000.0, head_rated=head, rise_to_shutoff_pct=rise)
        points = [[f * flow_lmin / 60000.0, max(0.0, pump.calculate_delta_p(f * flow_lmin / 60000.0, rho)) / 1e5] for f in FRACTIONS]
        centrifugal.append({"flowRatedLmin": flow_lmin, "headRatedM": head, "risePct": rise, "rho": rho, "points": points})

    volumetric = []
    for flow_lmin, kw, eff, drive in ((100.0, 5.0, 85.0, "fixed_speed"), (100.0, 1.5, 85.0, "vfd_power_limit")):
        pump = VolumetricPump("v", flow_rated=flow_lmin / 60000.0, motor_power=kw * 1000.0, efficiency=eff / 100.0, drive_type=drive)
        points = [[f * flow_lmin / 60000.0, max(0.0, pump.calculate_delta_p(f * flow_lmin / 60000.0, 1000.0)) / 1e5] for f in FRACTIONS]
        volumetric.append({"flowRatedLmin": flow_lmin, "motorPowerKw": kw, "efficiencyPct": eff,
                           "fixedSpeed": drive == "fixed_speed", "points": points})
    return {"centrifugal": centrifugal, "volumetric": volumetric}


def test_pump_curve_fixture_matches_the_backend_models():
    expected = build()
    if os.environ.get("WALFLOW_WRITE_FIXTURES"):
        with open(PATH, "w", encoding="utf-8", newline="\n") as f:
            json.dump(expected, f, indent=2)
            f.write("\n")
    with open(PATH, encoding="utf-8") as f:
        stored = json.load(f)
    assert stored == json.loads(json.dumps(expected))
