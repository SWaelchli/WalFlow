import math


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
    def get_orifice_cd_slope(reynolds_number: float) -> float:
        """dln(Cd)/dln(Re) of get_orifice_cd (0.5 in the laminar limit, 0 in the turbulent limit)."""
        re_safe = max(1e-6, abs(reynolds_number))
        u = 0.2 * math.sqrt(re_safe) / FluidProperties._CD_TURBULENT
        return 0.5 if u < 1e-6 else min(0.5, u / math.sinh(2.0 * u)) if u < 300 else 0.0

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
        Calculates IEC 60534-2-1 valve viscosity correction factor Fr.
        Scales effective Cv down smoothly when flow is in transition or laminar regime.
        Continuous and smooth across all regimes.
        """
        re_safe = max(1e-6, abs(reynolds_number))
        fr = (re_safe + 200.0) / (re_safe + 400.0)
        return max(0.4, min(1.0, fr))

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

        t_c = temp_k - 273.15
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
