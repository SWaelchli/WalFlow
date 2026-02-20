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
        
        elif fluid_type == "iso_vg_46":
            # ISO VG 46: 46 cSt @ 40°C, ~6.8 cSt @ 100°C
            # We calculate kinematic viscosity nu (cSt) then multiply by density
            # Vogel Equation for ISO VG 46 (approximate constants):
            # ln(nu) = A + B / (T + C)
            # Using typical values for mineral oil:
            A = -3.5
            B = 850.0
            C = -160.0 # T in Kelvin
            
            # nu in cSt (mm^2/s)
            nu_cst = math.exp(A + B / (temp_k + C))
            
            # Convert to Pa*s: (cSt * 1e-6) * density
            density = FluidProperties.get_density("iso_vg_46", temp_k)
            return (nu_cst * 1e-6) * density
            
        return 0.001 # Default to water @ 20°C
