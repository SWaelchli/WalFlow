import math
from functools import lru_cache

# Largest d(ln F_R)/d(ln Re_V) allowed for control valves: the drop rises at least as sqrt(Q) (D-29)
IEC_FR_MAX_SLOPE = 0.75


def _iec_fr_held(re_v: float, n: float, fl: float) -> float:
    """IEC 60534-2-1 Annex A F_R, Eq. (A.6)/(A.7), held at the (A.6) value of Re_V = 10 instead of jumping down."""
    f_lam = 0.026 / fl * math.sqrt(n * re_v)
    if re_v < 10.0:
        return min(f_lam, 1.0)
    f_trans = 1.0 + 0.33 * math.sqrt(fl) / n ** 0.25 * math.log10(re_v / 10000.0)
    f_lam_10 = 0.026 / fl * math.sqrt(n * 10.0)
    return min(max(f_trans, f_lam_10), f_lam, 1.0)


@lru_cache(maxsize=1024)
def _iec_fr_knee(n: float, fl: float):
    """
    Start (Re_V, F_R) of the (A.7) branch when F_R grows faster than IEC_FR_MAX_SLOPE there, else None.
    On the (A.7) branch d(ln F_R)/d(ln Re_V) = a / (ln 10 * F_R) falls as F_R rises, so only its start can
    be too steep. Depends only on the valve geometry and style: computed once per valve.
    """
    a = 0.33 * math.sqrt(fl) / n ** 0.25
    f_lam_10 = 0.026 / fl * math.sqrt(n * 10.0)
    if 1.0 - 3.0 * a < f_lam_10:
        # (A.7) starts below (A.6): the branch starts where it leaves the held value
        re_s, f_s = 10000.0 * 10.0 ** ((f_lam_10 - 1.0) / a), f_lam_10
    else:
        # (A.7) starts above (A.6): the branch starts where (A.7) crosses below the laminar term
        def h(log_re):
            return (1.0 + a * (log_re - 4.0)) - 0.026 / fl * math.sqrt(n * 10.0 ** log_re)
        lo, hi = 1.0, 4.0
        if h(hi) >= 0.0:
            return None
        for _ in range(60):
            mid = 0.5 * (lo + hi)
            lo, hi = (mid, hi) if h(mid) >= 0.0 else (lo, mid)
        re_s = 10.0 ** hi
        f_s = 1.0 + a * (hi - 4.0)
    if f_s >= 1.0 or a / (math.log(10.0) * f_s) <= IEC_FR_MAX_SLOPE:
        return None
    return re_s, f_s


class UnknownFluidError(ValueError):
    """A fluid id that is not in the catalog (for example a renamed id in an old file)."""


class FluidProperties:
    """
    Data-driven fluid property library used by the solver.

    Each fluid entry defines:
      - name:      Display label shown in the UI dropdowns.
      - category:  Group label used to organise the UI dropdowns.
      - density:   {"ref": rho0 (kg/m3) at t_ref_c, "alpha": expansion coeff (1/C)}.
                   rho(t) = ref * (1 - alpha * (t_c - t_ref_c)),
                   or {"model": "kell"} -> Kell (1975) water polynomial,
                   or {"model": "table", "t_c", "values"} -> linear interpolation (kg/m3)
      - viscosity: {"model": "water"} -> built-in water correlation,
                   or {"model": "vogel", "a", "b", "c"} -> nu(cSt) = exp(a + b / (t_c + c)),
                   or {"model": "walther", "nu40", "nu100"} -> ASTM D341 from nu at 40 and 100 C (cSt),
                   or {"model": "table", "t_c", "values"} -> dynamic viscosity (Pa*s), ln-linear interpolation
      - specific_heat: {"base": J/kgK, "slope": J/kgK per C} -> cp = base + slope * t_c,
                   or {"model": "water_table"} -> IAPWS saturated-liquid table,
                   or {"model": "table", "t_c", "values"} -> linear interpolation
      - vapor_pressure:
                   {"model": "water_saturation", "scale"} -> water Antoine x scale,
                   {"model": "rvp", "rvp_pa", "b_k"}  -> true vapor pressure from a representative Reid
                                                         vapor pressure (at 37.8 C), Clausius-Clapeyron slope b_k,
                   {"model": "negligible"}             -> ~1 Pa for oils and heavy fuels
    """

    FLUIDS = {
        # --------------------------- Water & Aqueous ---------------------------
        "water": {
            "name": "Water (Standard)",
            "category": "Water & Aqueous",
            "density": {"model": "kell"},
            "viscosity": {"model": "water"},
            "specific_heat": {"model": "water_table"},
            "vapor_pressure": {"model": "water_saturation", "scale": 1.0},
        },
        # Aqueous solutions: tabulated at representative temperatures (linear interpolation,
        # ln-linear for viscosity). Seawater S = 35 g/kg after Sharqawy et al. (2010);
        # glycol-water mixtures (mass fraction) after ASHRAE / Melinder (2010).
        "seawater": {
            "name": "Seawater (3.5% Salinity)",
            "category": "Water & Aqueous",
            "density": {"model": "table", "t_c": (0, 10, 20, 30, 40, 60, 80),
                        "values": (1028.1, 1026.9, 1024.8, 1021.7, 1017.0, 1007.0, 994.0)},
            "viscosity": {"model": "table", "t_c": (0, 10, 20, 30, 40, 60, 80),
                          "values": (1.88e-3, 1.40e-3, 1.08e-3, 0.87e-3, 0.72e-3, 0.52e-3, 0.41e-3)},
            "specific_heat": {"model": "table", "t_c": (0, 10, 20, 30, 40, 60, 80),
                              "values": (3986.0, 3992.0, 3993.0, 3993.0, 3993.0, 4001.0, 4015.0)},
            "vapor_pressure": {"model": "water_saturation", "scale": 0.981},
        },
        "glycol_30": {
            "name": "Ethylene Glycol 30%",
            "category": "Water & Aqueous",
            "density": {"model": "table", "t_c": (-10, 0, 20, 40, 60, 80),
                        "values": (1056.0, 1054.0, 1047.0, 1038.0, 1028.0, 1016.0)},
            "viscosity": {"model": "table", "t_c": (-10, 0, 20, 40, 60, 80),
                          "values": (5.2e-3, 3.7e-3, 2.1e-3, 1.3e-3, 0.9e-3, 0.65e-3)},
            "specific_heat": {"model": "table", "t_c": (-10, 0, 20, 40, 60, 80),
                              "values": (3680.0, 3700.0, 3740.0, 3780.0, 3820.0, 3860.0)},
            "vapor_pressure": {"model": "water_saturation", "scale": 0.89},
        },
        "glycol_50": {
            "name": "Ethylene Glycol 50%",
            "category": "Water & Aqueous",
            "density": {"model": "table", "t_c": (-20, 0, 20, 40, 60, 80),
                        "values": (1087.0, 1081.0, 1075.0, 1067.0, 1058.0, 1048.0)},
            "viscosity": {"model": "table", "t_c": (-20, 0, 20, 40, 60, 80),
                          "values": (18.0e-3, 7.0e-3, 3.9e-3, 2.3e-3, 1.5e-3, 1.05e-3)},
            "specific_heat": {"model": "table", "t_c": (-20, 0, 20, 40, 60, 80),
                              "values": (3080.0, 3182.0, 3283.0, 3385.0, 3486.0, 3587.0)},
            "vapor_pressure": {"model": "water_saturation", "scale": 0.78},
        },
        "propylene_glycol_50": {
            "name": "Propylene Glycol 50%",
            "category": "Water & Aqueous",
            "density": {"model": "table", "t_c": (-20, 0, 20, 40, 60, 80),
                        "values": (1048.0, 1046.0, 1038.0, 1028.0, 1017.0, 1005.0)},
            "viscosity": {"model": "table", "t_c": (-20, -10, 0, 20, 40, 60, 80),
                          "values": (85.0e-3, 40.0e-3, 20.0e-3, 6.8e-3, 3.1e-3, 1.7e-3, 1.1e-3)},
            "specific_heat": {"model": "table", "t_c": (-20, 0, 20, 40, 60, 80),
                              "values": (3370.0, 3470.0, 3560.0, 3650.0, 3740.0, 3830.0)},
            "vapor_pressure": {"model": "water_saturation", "scale": 0.81},
        },

        # ---------------------- Hydraulic & Lube Oils (ISO VG) ----------------------
        "iso_vg_15": {
            "name": "ISO VG 15 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 860.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "walther", "nu40": 15.0, "nu100": 3.5},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_22": {
            "name": "ISO VG 22 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 865.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "walther", "nu40": 22.0, "nu100": 4.3},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_32": {
            "name": "ISO VG 32 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 870.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "walther", "nu40": 32.0, "nu100": 5.4},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_46": {
            "name": "ISO VG 46 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 875.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "walther", "nu40": 46.0, "nu100": 6.8},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_68": {
            "name": "ISO VG 68 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 875.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "walther", "nu40": 68.0, "nu100": 8.8},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_100": {
            "name": "ISO VG 100 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 880.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "walther", "nu40": 100.0, "nu100": 11.4},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_150": {
            "name": "ISO VG 150 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 880.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "walther", "nu40": 150.0, "nu100": 15.0},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_220": {
            "name": "ISO VG 220 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 885.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "walther", "nu40": 220.0, "nu100": 19.4},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },

        # ------------------------- Engine & Specialty Oils -------------------------
        "sae_10w30": {
            "name": "SAE 10W-30 Engine Oil",
            "category": "Engine & Specialty Oils",
            "density": {"ref": 870.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -2.8134, "b": 1129.9, "c": 120.0},
            "specific_heat": {"base": 1900.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "sae_15w40": {
            "name": "SAE 15W-40 Engine Oil",
            "category": "Engine & Specialty Oils",
            "density": {"ref": 875.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -2.7295, "b": 1188.8, "c": 120.0},
            "specific_heat": {"base": 1900.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "transformer_oil": {
            "name": "Transformer / Insulating Oil",
            "category": "Engine & Specialty Oils",
            "density": {"ref": 870.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -2.6437, "b": 783.2, "c": 120.0},
            "specific_heat": {"base": 1880.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "thermal_oil": {
            "name": "Mineral Heat Transfer Oil",
            "category": "Engine & Specialty Oils",
            "density": {"ref": 880.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -3.3703, "b": 1072.4, "c": 120.0},
            "specific_heat": {"base": 1900.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },

        # ---------------------------------- Fuels ----------------------------------
        "diesel": {
            "name": "Diesel Fuel (No. 2)",
            "category": "Fuels",
            "density": {"ref": 840.0, "t_ref_c": 15.0, "alpha": 0.0008},
            "viscosity": {"model": "vogel", "a": -1.6661, "b": 406.65, "c": 120.0},
            "specific_heat": {"base": 2000.0, "slope": 0.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "jet_a": {
            "name": "Jet Fuel (Jet A-1)",
            "category": "Fuels",
            "density": {"ref": 800.0, "t_ref_c": 15.0, "alpha": 0.0008},
            "viscosity": {"model": "vogel", "a": -1.6093, "b": 286.65, "c": 120.0},
            "specific_heat": {"base": 2000.0, "slope": 0.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "kerosene": {
            "name": "Kerosene",
            "category": "Fuels",
            "density": {"ref": 800.0, "t_ref_c": 15.0, "alpha": 0.0008},
            "viscosity": {"model": "vogel", "a": -1.3797, "b": 249.92, "c": 120.0},
            "specific_heat": {"base": 2000.0, "slope": 0.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "gasoline": {
            "name": "Gasoline",
            "category": "Fuels",
            "density": {"ref": 745.0, "t_ref_c": 15.0, "alpha": 0.00095},
            "viscosity": {"model": "vogel", "a": -2.1989, "b": 240.92, "c": 120.0},
            "specific_heat": {"base": 2100.0, "slope": 0.0},
            "vapor_pressure": {"model": "rvp", "rvp_pa": 60e3, "b_k": 4800.0},
        },
        "crude_light": {
            "name": "Crude Oil (Light ~35°API)",
            "category": "Fuels",
            "density": {"ref": 850.0, "t_ref_c": 15.0, "alpha": 0.0008},
            "viscosity": {"model": "vogel", "a": -1.7503, "b": 537.56, "c": 120.0},
            "specific_heat": {"base": 2100.0, "slope": 0.0},
            "vapor_pressure": {"model": "rvp", "rvp_pa": 40e3, "b_k": 4800.0},
        },
        "crude_heavy": {
            "name": "Crude Oil (Heavy ~20°API)",
            "category": "Fuels",
            "density": {"ref": 930.0, "t_ref_c": 15.0, "alpha": 0.0008},
            "viscosity": {"model": "vogel", "a": -2.5741, "b": 1112.98, "c": 120.0},
            "specific_heat": {"base": 1900.0, "slope": 0.0},
            "vapor_pressure": {"model": "negligible"},
        },
    }

    @staticmethod
    def get_fluid(fluid_type: str) -> dict:
        """Catalog entry of a fluid id; an unknown id is an error, never a silent water default."""
        fluid = FluidProperties.FLUIDS.get(fluid_type)
        if fluid is None:
            raise UnknownFluidError(f"Unknown fluid '{fluid_type}'. Select a fluid from the catalog.")
        return fluid

    @staticmethod
    def temperature_range_c(fluid_type: str) -> tuple:
        """Validity range (t_min, t_max) in deg C of the property correlations of a fluid."""
        return FluidProperties.get_fluid(fluid_type)["t_range_c"]

    @staticmethod
    def get_fluid_catalog():
        """
        Returns the ordered fluid catalog (id, display name, category)
        used to populate the UI dropdowns.
        """
        return [
            {"id": fid, "name": fluid["name"], "category": fluid["category"]}
            for fid, fluid in FluidProperties.FLUIDS.items()
        ]

    @staticmethod
    def get_density(fluid_type: str, temp_k: float) -> float:
        fluid = FluidProperties.get_fluid(fluid_type)
        t_c = temp_k - 273.15
        d = fluid["density"]
        if d.get("model") == "kell":
            # Kell (1975), water at 1 atm, 0-150 °C
            return (999.83952 + 16.945176 * t_c - 7.9870401e-3 * t_c**2 - 46.170461e-6 * t_c**3
                    + 105.56302e-9 * t_c**4 - 280.54253e-12 * t_c**5) / (1.0 + 16.879850e-3 * t_c)
        if d.get("model") == "table":
            return FluidProperties._interp_table(d, t_c)
        return d["ref"] * (1 - d["alpha"] * (t_c - d["t_ref_c"]))

    @staticmethod
    def get_viscosity(fluid_type: str, temp_k: float) -> float:
        """
        Returns dynamic viscosity (Pa*s or kg/(m*s)).
        Note: 1 cP = 0.001 Pa*s
        """
        fluid = FluidProperties.get_fluid(fluid_type)

        v = fluid["viscosity"]

        if v["model"] == "water":
            # mu = 2.414e-5 * 10^(247.8 / (T - 140)) [T in Kelvin]
            return 2.414e-5 * 10**(247.8 / (temp_k - 140))

        t_c = temp_k - 273.15
        if v["model"] == "table":
            return FluidProperties._interp_table(v, t_c, log=True)
        if v["model"] == "walther":
            # ASTM D341 / Walther: log10(log10(nu + 0.7)) = A - B*log10(T[K]), fitted to nu40 and nu100 (cSt)
            z40 = math.log10(math.log10(v["nu40"] + 0.7))
            z100 = math.log10(math.log10(v["nu100"] + 0.7))
            x40, x100 = math.log10(313.15), math.log10(373.15)
            slope = (z40 - z100) / (x100 - x40)
            z = z40 + slope * x40 - slope * math.log10(temp_k)
            nu_cst = 10.0 ** (10.0 ** z) - 0.7
        else:
            # Vogel Equation for Oils: ln(nu) = A + B / (T_c + C)
            # nu in cSt (mm^2/s), T_c in °C
            nu_cst = math.exp(v["a"] + v["b"] / (t_c + v["c"]))

        # Convert to Pa*s: (cSt * 1e-6) * density
        density = FluidProperties.get_density(fluid_type, temp_k)
        return (nu_cst * 1e-6) * density

    _CD_TURBULENT = 0.60

    @staticmethod
    def get_orifice_cd(reynolds_number: float) -> float:
        """
        Discharge coefficient Cd of a sharp-edged orifice versus the orifice Reynolds number (F1-25).
        Laminar (Wuest) law Cd = 0.2*sqrt(Re) blended into the turbulent limit 0.60 with
        Cd = Cd_t * tanh(0.2*sqrt(Re) / Cd_t): continuous and monotonic, Cd -> 0.60 for Re -> infinity.
        """
        re_safe = max(1e-6, abs(reynolds_number))
        cd_t = FluidProperties._CD_TURBULENT
        return cd_t * math.tanh(0.2 * math.sqrt(re_safe) / cd_t)

    @staticmethod
    def get_orifice_permanent_loss_ratio(cd: float, beta: float) -> float:
        """
        Permanent pressure loss / tap differential pressure of an orifice, ISO 5167-2:2022 §5.4 Formula (7) (D-28).
        cd is the discharge coefficient C_d, not the meter coefficient C_d / sqrt(1 - beta^4).
        """
        s = math.sqrt(1.0 - beta ** 4 * (1.0 - cd ** 2))
        return (s - cd * beta ** 2) / (s + cd * beta ** 2)

    @staticmethod
    def get_classic_orifice_dp(flow_rate: float, density: float, viscosity: float, pipe_d: float, orif_d: float) -> float:
        """
        Permanent pressure drop of a sharp-edged orifice (bore orif_d in a pipe of bore pipe_d, both in m):
        tap differential with the tanh C_d law of get_orifice_cd times the Formula (7) loss ratio, beta = min(0.99, d/D).
        Shared by the calibrated restriction, check valve orifice, reduced-bore rupture disc and classic orifice model.
        """
        beta = min(0.99, orif_d / pipe_d)
        velocity = flow_rate / max(1e-9, math.pi * (pipe_d / 2.0) ** 2)
        dynamic_pressure = 0.5 * density * velocity * abs(velocity)
        v_orifice = flow_rate / max(1e-9, math.pi * (orif_d / 2.0) ** 2)
        re_orifice = (density * abs(v_orifice) * orif_d) / max(1e-7, viscosity)
        cd = FluidProperties.get_orifice_cd(re_orifice)
        tap_dp = dynamic_pressure * (1.0 - beta ** 4) / (cd ** 2 * beta ** 4)
        return tap_dp * FluidProperties.get_orifice_permanent_loss_ratio(cd, beta)

    @staticmethod
    def get_darcy_friction_factor(reynolds_number: float, rel_roughness: float) -> float:
        """Darcy friction factor from the Churchill (1977) equation (F1-21, D-07): one continuous expression
        for laminar (64/Re), transition and turbulent (Colebrook-like) flow. rel_roughness = eps/D, 0 = smooth."""
        re = max(1e-6, abs(reynolds_number))
        if re < 10.0:
            return 64.0 / re
        a = (2.457 * math.log(1.0 / ((7.0 / re) ** 0.9 + 0.27 * rel_roughness))) ** 16
        b = (37530.0 / re) ** 16
        return 8.0 * ((8.0 / re) ** 12 + 1.0 / (a + b) ** 1.5) ** (1.0 / 12.0)

    @staticmethod
    def get_darcy_friction_slope(reynolds_number: float, rel_roughness: float) -> float:
        """Exact df/dln(Re) of get_darcy_friction_factor (-f in the laminar range)."""
        re = max(1e-6, abs(reynolds_number))
        if re < 10.0:
            return -64.0 / re
        r7 = (7.0 / re) ** 0.9
        x = r7 + 0.27 * rel_roughness
        ln_inv_x = math.log(1.0 / x)
        a = (2.457 * ln_inv_x) ** 16
        b = (37530.0 / re) ** 16
        c = (8.0 / re) ** 12
        s = c + 1.0 / (a + b) ** 1.5
        f = 8.0 * s ** (1.0 / 12.0)
        da = 16.0 * a * (0.9 * r7 / x) / ln_inv_x
        ds = -12.0 * c - 1.5 * (da - 16.0 * b) / (a + b) ** 2.5
        return f * ds / (12.0 * s)

    @staticmethod
    def get_valve_fr(reynolds_number: float) -> float:
        """
        Smooth viscosity correction factor Fr for valves outside the scope of IEC 60534
        (check valves, regulators). Not the standard's formula: control valves use
        get_iec_valve_fr (D-29). Scales effective Cv down smoothly in the transition
        and laminar regimes, with a floor of 0.4.
        """
        re_safe = max(1e-6, abs(reynolds_number))
        fr = (re_safe + 200.0) / (re_safe + 400.0)
        return max(0.4, min(1.0, fr))

    @staticmethod
    def get_iec_valve_reynolds(flow_rate: float, kinematic_viscosity: float, cv: float,
                               fl: float, fd: float, diameter: float) -> float:
        """
        Valve Reynolds number Re_V, IEC 60534-2-1:2011 Eq. (23) / (A.1), Cv constants of Table 1.
        flow_rate in m^3/s, kinematic_viscosity in m^2/s, diameter (pipe bore D) in m.
        """
        n2, n4 = 2.14e-3, 7.60e-2
        q_m3h = abs(flow_rate) * 3600.0
        d_mm = max(1e-3, diameter) * 1000.0
        c = max(1e-9, cv)
        return (n4 * fd * q_m3h / (max(1e-12, kinematic_viscosity) * math.sqrt(c * fl))
                * ((fl * fl * c * c) / (n2 * d_mm ** 4) + 1.0) ** 0.25)

    @staticmethod
    def get_iec_valve_fr(flow_rate: float, kinematic_viscosity: float, cv: float, cv_rated: float,
                         fl: float, fd: float, diameter: float) -> float:
        """
        Reynolds number factor F_R of IEC 60534-2-1:2011 Annex A (D-29).
        Laminar (Re_V < 10): Eq. (A.6); transitional (Re_V >= 10): Eq. (A.7); n from Eq. (A.8a)
        for full-size trim (C_rated/(N18 d^2) >= 0.016), otherwise Eq. (A.8b).
        The valve is taken as line-size (Annex A.4): d = D = pipe bore. F_R stays above zero so
        the Cv law gives a finite drop, linear in Q at low flow.
        Deviations (D-29), both only for valves very small or very large for the line (n <~ 1.2):
        - No jump: for Re_V >= 10, F_R is not allowed below the laminar value at Re_V = 10. Where (A.7)
          starts below (A.6), the standard's F_R jumps down there and the pressure drop has a gap with
          no flow; here F_R holds that value until (A.7) rises past it.
        - Growth cap: where (A.7) takes over at a small F_R it rises faster than Re_V, so the standard's
          pressure drop falls with rising flow (a negative resistance the solver cannot converge on).
          F_R may grow at most as Re_V**IEC_FR_MAX_SLOPE, so the drop rises at least as sqrt(Q).
        """
        n2, n18, n32 = 2.14e-3, 1.00, 1.27e2
        re_v = FluidProperties.get_iec_valve_reynolds(flow_rate, kinematic_viscosity, cv, fl, fd, diameter)
        d_mm = max(1e-3, diameter) * 1000.0
        cd2 = max(1e-12, cv_rated) / d_mm ** 2
        n = n2 / cd2 ** 2 if cd2 / n18 >= 0.016 else 1.0 + n32 * cd2 ** (2.0 / 3.0)
        fr = _iec_fr_held(re_v, n, fl)
        knee = _iec_fr_knee(n, fl)
        if knee is not None and re_v > knee[0]:
            fr = min(fr, knee[1] * (re_v / knee[0]) ** IEC_FR_MAX_SLOPE)
        return max(1e-9, fr)

    @staticmethod
    def get_filter_viscosity_factor(reynolds_number: float) -> float:
        """
        Calculates dynamic friction multiplier for porous filter elements.
        Smoothly blended between laminar (Re < 2000) and turbulent (Re > 4000) regimes.
        """
        re_safe = max(1e-6, abs(reynolds_number))
        if re_safe < 2000.0:
            return 1.0 + (100.0 / re_safe)
        elif re_safe > 4000.0:
            return 1.0
        else:
            w = (re_safe - 2000.0) / 2000.0
            return 1.0 + (1.0 - w) * (100.0 / re_safe)

    @staticmethod
    def get_vapor_pressure(fluid_type: str, temp_k: float) -> float:
        """
        Calculates vapor pressure in Pascals (Pa) using Antoine equation.
        """
        fluid = FluidProperties.get_fluid(fluid_type)
        model = fluid["vapor_pressure"]

        if model["model"] == "water_saturation":
            # Wagner-Pruss saturation pressure (IAPWS-95): one continuous curve, no step at 100 °C
            tc_k, pc_pa = 647.096, 22.064e6
            t_k = min(max(temp_k, 200.0), tc_k)
            th = 1.0 - t_k / tc_k
            ln_ratio = (tc_k / t_k) * (-7.85951783 * th + 1.84408259 * th**1.5 - 11.7866497 * th**3
                                       + 22.6807411 * th**3.5 - 15.9618719 * th**4 + 1.80122502 * th**7.5)
            return pc_pa * math.exp(ln_ratio) * model.get("scale", 1.0)

        elif model["model"] == "rvp":
            # Representative RVP at 37.8 C extrapolated with ln(Pv) = ln(RVP) + B (1/310.93 - 1/T)
            return model["rvp_pa"] * math.exp(model["b_k"] * (1.0 / 310.93 - 1.0 / temp_k))

        # Oils and heavy fuels have negligible vapor pressure in this range
        return 1.0

    @staticmethod
    def get_specific_heat(fluid_type: str, temp_k: float) -> float:
        """
        Returns specific heat capacity (J/kg*K).
        """
        fluid = FluidProperties.get_fluid(fluid_type)

        cp = fluid["specific_heat"]
        t_c = temp_k - 273.15
        if cp.get("model") == "water_table":
            return FluidProperties._interp_water_cp(t_c)
        if cp.get("model") == "table":
            return FluidProperties._interp_table(cp, t_c)
        return cp["base"] + cp["slope"] * t_c

    @staticmethod
    def _interp_table(spec: dict, t_c: float, log: bool = False) -> float:
        """Piecewise interpolation in a property table; holds the end values outside its range."""
        ts, vs = spec["t_c"], spec["values"]
        if t_c <= ts[0]:
            return vs[0]
        if t_c >= ts[-1]:
            return vs[-1]
        i = 0
        while t_c > ts[i + 1]:
            i += 1
        w = (t_c - ts[i]) / (ts[i + 1] - ts[i])
        if log:
            return math.exp((1.0 - w) * math.log(vs[i]) + w * math.log(vs[i + 1]))
        return (1.0 - w) * vs[i] + w * vs[i + 1]

    # IAPWS saturated-liquid water cp (J/kg*K) every 10 °C from 0 to 150 °C
    _WATER_CP_TABLE = (4219.9, 4195.5, 4184.4, 4180.1, 4179.6, 4181.5, 4185.5, 4190.5,
                       4197.0, 4205.0, 4216.0, 4229.0, 4245.0, 4265.0, 4287.0, 4310.0)

    @staticmethod
    def _interp_water_cp(t_c: float) -> float:
        table = FluidProperties._WATER_CP_TABLE
        x = min(max(t_c, 0.0), 150.0) / 10.0
        i = min(int(x), len(table) - 2)
        return table[i] + (x - i) * (table[i + 1] - table[i])

    # 3-point Gauss-Legendre nodes/weights on [-1, 1]
    _GL_NODES = (-0.7745966692414834, 0.0, 0.7745966692414834)
    _GL_WEIGHTS = (5.0 / 9.0, 8.0 / 9.0, 5.0 / 9.0)

    @staticmethod
    def get_enthalpy(fluid_type: str, temp_k: float) -> float:
        """Specific enthalpy h(T) = integral of cp dT from 273.15 K (J/kg); valid for any cp(T)."""
        half = 0.5 * (temp_k - 273.15)
        mid = 273.15 + half
        return half * sum(
            w * FluidProperties.get_specific_heat(fluid_type, mid + half * x)
            for x, w in zip(FluidProperties._GL_NODES, FluidProperties._GL_WEIGHTS)
        )

    @staticmethod
    def get_temperature_from_enthalpy(fluid_type: str, enthalpy: float, guess_k: float = 293.15) -> float:
        """Inverse of get_enthalpy (Newton, cp > 0 so h(T) is monotonic)."""
        t = guess_k
        for _ in range(30):
            err = FluidProperties.get_enthalpy(fluid_type, t) - enthalpy
            t_next = t - err / FluidProperties.get_specific_heat(fluid_type, t)
            if abs(t_next - t) < 1e-9:
                return t_next
            t = t_next
        return t


# Validity range of the property correlations in deg C: lower limit near the pour / freezing point
# (viscosity and density are not meaningful below it), upper limit of the data or of liquid service.
_T_RANGE_C = {
    "water": (0, 150), "seawater": (0, 80),
    "glycol_30": (-10, 80), "glycol_50": (-20, 80), "propylene_glycol_50": (-20, 80),
    "iso_vg_15": (-30, 120), "iso_vg_22": (-27, 120), "iso_vg_32": (-24, 120), "iso_vg_46": (-21, 120),
    "iso_vg_68": (-18, 120), "iso_vg_100": (-15, 120), "iso_vg_150": (-12, 120), "iso_vg_220": (-9, 120),
    "sae_10w30": (-30, 130), "sae_15w40": (-25, 130), "transformer_oil": (-40, 110), "thermal_oil": (-5, 250),
    "diesel": (-10, 150), "jet_a": (-40, 150), "kerosene": (-30, 150), "gasoline": (-40, 80),
    "crude_light": (0, 150), "crude_heavy": (10, 150),
}
for _fid, _fluid in FluidProperties.FLUIDS.items():
    _fluid["t_range_c"] = _T_RANGE_C[_fid]
