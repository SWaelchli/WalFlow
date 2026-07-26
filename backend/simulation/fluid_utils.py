import math

class FluidProperties:
    """
    Utility to calculate fluid properties based on temperature.
    Currently supports:
    - "water": Simple linear model
    - "iso_vg_46": Standard lube oil model
    """
    
    @staticmethod
    def get_density(fluid_type: str, temp_k: float) -> float:
        t_c = temp_k - 273.15
        
        if fluid_type == "water":
            # Very simple linear approximation for water near 20-80°C
            return 1000.0 * (1 - 0.0002 * (t_c - 20))
        
        elif fluid_type == "iso_vg_46":
            # Typical lube oil density: 875 kg/m³ @ 15°C, alpha ~ 0.0007 /°C
            return 875.0 * (1 - 0.0007 * (t_c - 15))
        
        elif fluid_type == "iso_vg_32":
            # Typical lube oil density: 870 kg/m³ @ 15°C, alpha ~ 0.0007 /°C
            return 870.0 * (1 - 0.0007 * (t_c - 15))
        
        return 1000.0

    @staticmethod
    def get_viscosity(fluid_type: str, temp_k: float) -> float:
        """
        Returns dynamic viscosity (Pa*s or kg/(m*s)).
        Note: 1 cP = 0.001 Pa*s
        """
        t_c = temp_k - 273.15
        
        if fluid_type == "water":
            # Simple approximation for water viscosity
            # mu = 0.00179 * exp(-0.025 * t_c) -- very rough
            # More accurate: mu = 2.414e-5 * 10^(247.8 / (T - 140))
            return 2.414e-5 * 10**(247.8 / (temp_k - 140))
        
        elif fluid_type in ["iso_vg_46", "iso_vg_32"]:
            # Vogel Equation for Lubricating Oils: ln(nu) = A + B / (T_c + C)
            # T_c is in °C, nu is in cSt (mm^2/s)
            if fluid_type == "iso_vg_46":
                # ISO VG 46: 46 cSt @ 40°C, ~6.5 cSt @ 100°C, ~300 cSt @ 10°C
                A, B, C = -3.5, 1170.0, 120.0
            else:
                # ISO VG 32: 32 cSt @ 40°C, ~5.4 cSt @ 100°C, ~180 cSt @ 10°C
                A, B, C = -3.7, 1130.0, 120.0
            
            # nu in cSt (mm^2/s)
            nu_cst = math.exp(A + B / (t_c + C))
            
            # Convert to Pa*s: (cSt * 1e-6) * density
            density = FluidProperties.get_density(fluid_type, temp_k)
            return (nu_cst * 1e-6) * density
            
        return 0.001 # Default to water @ 20°C

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
        Scales effective Cv down smoothly when flow is in transition or laminar regime (Re < 2000).
        Bounded between 0.4 and 1.0 for numerical stability.
        """
        re_safe = max(1e-6, abs(reynolds_number))
        if re_safe >= 2000.0:
            return 1.0
        fr = (re_safe + 200.0) / (re_safe + 400.0)
        return max(0.4, min(1.0, fr))

    @staticmethod
    def get_filter_viscosity_factor(reynolds_number: float) -> float:
        """
        Calculates dynamic friction multiplier for porous filter elements.
        Accounts for laminar Darcy flow resistance at low Re.
        """
        re_safe = max(1e-6, abs(reynolds_number))
        if re_safe >= 2000.0:
            return 1.0
        return 1.0 + (100.0 / re_safe)

    @staticmethod
    def get_vapor_pressure(fluid_type: str, temp_k: float) -> float:
        """
        Calculates vapor pressure in Pascals (Pa) using Antoine equation.
        """
        t_c = temp_k - 273.15
        
        if fluid_type == "water" or fluid_type not in ["iso_vg_46", "iso_vg_32"]:
            # For unknown fluids, default to dynamic water calculation
            # Antoine equation for water: log10(P) = A - (B / (C + T))
            # P is in mmHg, T is in °C
            if t_c < 100.0:
                # Constants valid for 1°C to 100°C
                A, B, C = 8.07131, 1730.63, 233.426
            else:
                # Constants valid for 99°C to 374°C
                A, B, C = 8.14019, 1810.94, 244.485
            
            # Avoid singularity at T = -C
            if t_c <= -C:
                return 0.0
                
            pressure_mmhg = 10**(A - (B / (C + t_c)))
            
            # Convert mmHg to Pascals (1 mmHg = 133.322387 Pa)
            return pressure_mmhg * 133.322387
            
        elif fluid_type in ["iso_vg_46", "iso_vg_32"]:
            # Lube oils have very low vapor pressure, ~0 for this simulation
            return 1.0

    @staticmethod
    def get_specific_heat(fluid_type: str, temp_k: float) -> float:
        """
        Returns specific heat capacity (J/kg*K).
        """
        if fluid_type == "water":
            return 4184.0  # Constant for water
        
        elif fluid_type in ["iso_vg_46", "iso_vg_32"]:
            # Typical lube oil: 1800-2200 J/kg*K depending on temp
            # Linear approximation: Cp = 1800 + 4.0 * (T_c - 20)
            t_c = temp_k - 273.15
            return 1860.0 + 4.0 * t_c
            
        return 2000.0 # Generic default
