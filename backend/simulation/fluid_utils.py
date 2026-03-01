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
            # Vogel Equation for Lubricating Oils: ln(nu) = A + B / (T + C)
            if fluid_type == "iso_vg_46":
                # ISO VG 46: 46 cSt @ 40°C, ~6.8 cSt @ 100°C
                A, B, C = -3.5, 850.0, -160.0
            else:
                # ISO VG 32: 32 cSt @ 40°C, ~5.4 cSt @ 100°C (Approximated Vogel)
                A, B, C = -3.7, 820.0, -165.0
            
            # nu in cSt (mm^2/s)
            nu_cst = math.exp(A + B / (temp_k + C))
            
            # Convert to Pa*s: (cSt * 1e-6) * density
            density = FluidProperties.get_density(fluid_type, temp_k)
            return (nu_cst * 1e-6) * density
            
        return 0.001 # Default to water @ 20°C
