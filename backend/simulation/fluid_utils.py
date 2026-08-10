import math


class FluidProperties:
    """
    Data-driven fluid property library used by the solver.

    Each fluid entry defines:
      - name:      Display label shown in the UI dropdowns.
      - category:  Group label used to organise the UI dropdowns.
      - density:   {"ref": rho0 (kg/m3) at t_ref_c, "alpha": expansion coeff (1/C)}.
                   rho(t) = ref * (1 - alpha * (t_c - t_ref_c))
      - viscosity: {"model": "water"} -> built-in water correlation,
                   or {"model": "vogel", "a", "b", "c"} -> nu(cSt) = exp(a + b / (t_c + c))
      - specific_heat: {"base": J/kgK, "slope": J/kgK per C} -> cp = base + slope * t_c
      - vapor_pressure:
                   {"model": "water_antoine", "scale"} -> water Antoine x scale,
                   {"model": "fuel_antoine"}           -> naphtha/gasoline Antoine,
                   {"model": "negligible"}             -> ~1 Pa for oils and heavy fuels
    """

    FLUIDS = {
        # --------------------------- Water & Aqueous ---------------------------
        "water": {
            "name": "Water (Standard)",
            "category": "Water & Aqueous",
            "density": {"ref": 1000.0, "t_ref_c": 20.0, "alpha": 0.0002},
            "viscosity": {"model": "water"},
            "specific_heat": {"base": 4184.0, "slope": 0.0},
            "vapor_pressure": {"model": "water_antoine", "scale": 1.0},
        },
        "seawater": {
            "name": "Seawater (3.5% Salinity)",
            "category": "Water & Aqueous",
            "density": {"ref": 1025.0, "t_ref_c": 15.0, "alpha": 0.00021},
            "viscosity": {"model": "vogel", "a": -1.6205, "b": 233.28, "c": 120.0},
            "specific_heat": {"base": 3990.0, "slope": 0.0},
            "vapor_pressure": {"model": "water_antoine", "scale": 0.98},
        },
        "glycol_30": {
            "name": "Ethylene Glycol 30%",
            "category": "Water & Aqueous",
            "density": {"ref": 1040.0, "t_ref_c": 20.0, "alpha": 0.00055},
            "viscosity": {"model": "vogel", "a": -3.0592, "b": 548.90, "c": 120.0},
            "specific_heat": {"base": 3650.0, "slope": 0.0},
            "vapor_pressure": {"model": "water_antoine", "scale": 0.9},
        },
        "glycol_50": {
            "name": "Ethylene Glycol 50%",
            "category": "Water & Aqueous",
            "density": {"ref": 1072.0, "t_ref_c": 20.0, "alpha": 0.00055},
            "viscosity": {"model": "vogel", "a": -3.1883, "b": 628.80, "c": 120.0},
            "specific_heat": {"base": 3300.0, "slope": 0.0},
            "vapor_pressure": {"model": "water_antoine", "scale": 0.7},
        },
        "propylene_glycol_50": {
            "name": "Propylene Glycol 50%",
            "category": "Water & Aqueous",
            "density": {"ref": 1038.0, "t_ref_c": 20.0, "alpha": 0.00055},
            "viscosity": {"model": "vogel", "a": -3.9872, "b": 796.87, "c": 120.0},
            "specific_heat": {"base": 3450.0, "slope": 0.0},
            "vapor_pressure": {"model": "water_antoine", "scale": 0.6},
        },

        # ---------------------- Hydraulic & Lube Oils (ISO VG) ----------------------
        "iso_vg_15": {
            "name": "ISO VG 15 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 860.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -2.7343, "b": 870.77, "c": 120.0},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_22": {
            "name": "ISO VG 22 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 865.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -2.9802, "b": 971.40, "c": 120.0},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_32": {
            "name": "ISO VG 32 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 870.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -3.7, "b": 1130.0, "c": 120.0},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_46": {
            "name": "ISO VG 46 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 875.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -3.5, "b": 1170.0, "c": 120.0},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_68": {
            "name": "ISO VG 68 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 875.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -3.2780, "b": 1199.6, "c": 120.0},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_100": {
            "name": "ISO VG 100 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 880.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -3.3561, "b": 1273.8, "c": 120.0},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_150": {
            "name": "ISO VG 150 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 880.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -3.4325, "b": 1350.9, "c": 120.0},
            "specific_heat": {"base": 1860.0, "slope": 4.0},
            "vapor_pressure": {"model": "negligible"},
        },
        "iso_vg_220": {
            "name": "ISO VG 220 Oil",
            "category": "Hydraulic & Lube Oils (ISO VG)",
            "density": {"ref": 885.0, "t_ref_c": 15.0, "alpha": 0.0007},
            "viscosity": {"model": "vogel", "a": -3.5852, "b": 1436.6, "c": 120.0},
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
            "vapor_pressure": {"model": "fuel_antoine"},
        },
        "crude_light": {
            "name": "Crude Oil (Light ~35°API)",
            "category": "Fuels",
            "density": {"ref": 850.0, "t_ref_c": 15.0, "alpha": 0.0008},
            "viscosity": {"model": "vogel", "a": -1.7503, "b": 537.56, "c": 120.0},
            "specific_heat": {"base": 2100.0, "slope": 0.0},
            "vapor_pressure": {"model": "negligible"},
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
        fluid = FluidProperties.FLUIDS.get(fluid_type)
        if fluid is None:
            return 1000.0
        t_c = temp_k - 273.15
        d = fluid["density"]
        return d["ref"] * (1 - d["alpha"] * (t_c - d["t_ref_c"]))

    @staticmethod
    def get_viscosity(fluid_type: str, temp_k: float) -> float:
        """
        Returns dynamic viscosity (Pa*s or kg/(m*s)).
        Note: 1 cP = 0.001 Pa*s
        """
        fluid = FluidProperties.FLUIDS.get(fluid_type)
        if fluid is None:
            return 0.001  # Default to water @ 20°C

        v = fluid["viscosity"]

        if v["model"] == "water":
            # mu = 2.414e-5 * 10^(247.8 / (T - 140)) [T in Kelvin]
            return 2.414e-5 * 10**(247.8 / (temp_k - 140))

        # Vogel Equation for Oils: ln(nu) = A + B / (T_c + C)
        # nu in cSt (mm^2/s), T_c in °C
        t_c = temp_k - 273.15
        nu_cst = math.exp(v["a"] + v["b"] / (t_c + v["c"]))

        # Convert to Pa*s: (cSt * 1e-6) * density
        density = FluidProperties.get_density(fluid_type, temp_k)
        return (nu_cst * 1e-6) * density

    @staticmethod
    def get_orifice_cd(reynolds_number: float) -> float:
        """
        Calculates dynamic discharge coefficient Cd for sharp-edged orifices
        based on Reynolds number.
        As Re -> infinity, Cd -> 0.60 (turbulent limit).
        As Re -> 0, Cd decreases smoothly due to viscous drag.
        """
        re_safe = max(1e-6, abs(reynolds_number))
        cd_turbulent = 0.60
        cd = cd_turbulent / math.sqrt(1.0 + 250.0 / re_safe)
        return max(0.05, cd)

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
        fluid = FluidProperties.FLUIDS.get(fluid_type)
        if fluid is None:
            # Legacy default: dynamic water calculation
            fluid = FluidProperties.FLUIDS["water"]

        t_c = temp_k - 273.15
        model = fluid["vapor_pressure"]

        if model["model"] == "water_antoine":
            # Antoine equation for water: log10(P) = A - (B / (C + T))
            # P is in mmHg, T is in °C
            if t_c < 100.0:
                A, B, C = 8.07131, 1730.63, 233.426
            else:
                A, B, C = 8.14019, 1810.94, 244.485

            if t_c <= -C:
                return 0.0

            pressure_mmhg = 10**(A - (B / (C + t_c)))
            return pressure_mmhg * 133.322387 * model.get("scale", 1.0)

        elif model["model"] == "fuel_antoine":
            # n-Heptane Antoine constants (mmHg, 10-80°C) as a
            # representative light-naphtha / gasoline model.
            A, B, C = 6.89677, 1264.9, 216.636
            if t_c <= -C:
                return 0.0
            pressure_mmhg = 10**(A - (B / (C + t_c)))
            return pressure_mmhg * 133.322387

        # Oils and heavy fuels have negligible vapor pressure in this range
        return 1.0

    @staticmethod
    def get_specific_heat(fluid_type: str, temp_k: float) -> float:
        """
        Returns specific heat capacity (J/kg*K).
        """
        fluid = FluidProperties.FLUIDS.get(fluid_type)
        if fluid is None:
            return 2000.0  # Generic default

        cp = fluid["specific_heat"]
        t_c = temp_k - 273.15
        return cp["base"] + cp["slope"] * t_c
