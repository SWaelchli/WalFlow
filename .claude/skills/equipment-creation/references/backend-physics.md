# Backend Physics & Architecture Guide

This guide provides deep technical details on implementing the physics model for hydraulic components in WalFlow.

---

## 1. Class Structure & Inheritance

All components inherit from `HydraulicNode` located in `backend/simulation/equipment/base_node.py`.

```python
from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
from typing import Optional

class CustomEquipment(HydraulicNode):
    def __init__(self, name: str, param1: float, param2: float):
        # 1. Base initialization: node_type MUST match the frontend type string exactly
        super().__init__(name, node_type="custom_equipment")
        
        # 2. Store internal SI properties (Pa, m3/s, K, W, etc.)
        self.param1 = param1
        self.param2 = param2
        
        # 3. Solver flags (see solver-stability.md for details)
        self.is_pressure_boundary = False
        self.is_flow_boundary = False
        self.blocks_flow_on_shutdown = False
        self.use_mcp_formulation = False
        
        # 4. Port initialization (order matters!)
        self.add_inlet()
        self.add_outlet()
```

---

## 2. Port Architecture & Schemas

Ports represent fluid connection points on the node.
- `self.add_inlet()` appends a new `Port` object to `self.inlets`.
- `self.add_outlet()` appends a new `Port` object to `self.outlets`.

### Port Attributes (`simulation/schemas.py`)
Each `Port` has:
- `pressure`: Static pressure in Pascals [$\text{Pa}$].
- `flow_rate`: Volumetric flow rate in cubic meters per second [$\text{m}^3/\text{s}$]. Positive means flow enters an inlet or leaves an outlet.
- `temperature`: Fluid temperature in Kelvin [$\text{K}$].
- `density`: Fluid density in kilograms per cubic meter [$\text{kg}/\text{m}^3$].
- `viscosity`: Fluid dynamic viscosity in Pascal-seconds [$\text{Pa}\cdot\text{s}$].

---

## 3. Core Physics Methods

### 3.1 `calculate_delta_p`
Calculates the pressure drop across the component as a function of volumetric flow rate, fluid density, and dynamic viscosity.
```python
def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
    """
    Computes pressure drop dP = P_in - P_out in Pascals.
    Must handle positive, negative, and near-zero flow rates continuously.
    """
    # Example quadratic head loss: dP = k * rho * q * |q|
    dp = self.k * density * flow_rate * abs(flow_rate)
    return dp
```

### 3.2 `calculate_dp_derivative`
Returns the analytical derivative $\frac{\partial \Delta P}{\partial Q}$.
```python
def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
    """
    Returns d(dP)/dq in Pa / (m3/s).
    Must be strictly positive (for passive resistors) and continuous.
    """
    return 2.0 * self.k * density * abs(flow_rate)
```

### 3.3 `calculate()`
Executed during the final telemetry update phase after the system matrix has converged. It:
1. Computes the final $\Delta P$.
2. Sets outlet pressure: `outlet.pressure = inlet.pressure - dp`.
3. Propagates flow rate: `outlet.flow_rate = inlet.flow_rate`.
4. Computes throttling thermal rise (Joule-Thomson / viscous dissipation) or energy balance.
5. Updates fluid properties based on resulting temperature.

```python
def calculate(self):
    inlet = self.inlets[0]
    outlet = self.outlets[0]
    
    dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
    
    outlet.pressure = inlet.pressure - dp
    outlet.flow_rate = inlet.flow_rate
    outlet.density = inlet.density
    outlet.viscosity = inlet.viscosity
    
    # Throttling Heat: dT = |dP| / (rho * Cp)
    fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
    
    if inlet.flow_rate >= 0:
        cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
        dt = abs(dp) / (inlet.density * cp)
        outlet.temperature = inlet.temperature + dt
    else:
        cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
        dt = abs(dp) / (outlet.density * cp)
        inlet.temperature = outlet.temperature + dt

    # Update fluid properties based on new temperature
    outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
    outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
    inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
    inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)
    
    self.calculate_temperature()
    return dp
```

---

## 4. Direction-Aware Thermal Balance (`calculate_temperature`)

`HydraulicNode.calculate_temperature()` provides direction-aware enthalpy mixing across multiple ports:
- Ports with flow entering the node are source ports.
- Total incoming enthalpy $\sum \dot{m}_i C_p T_i$ is distributed equally to all outward ports.

For nodes with specialized heating/cooling (e.g. Heat Exchangers or pumps), calculate the custom port temperature **before** calling `self.calculate_temperature()`.

---

## 5. Fluid Properties Utility (`FluidProperties`)

WalFlow includes thermo-physical property tables in `backend/simulation/fluid_utils.py`:
- `FluidProperties.get_density(fluid_type: str, temp_k: float) -> float`
- `FluidProperties.get_viscosity(fluid_type: str, temp_k: float) -> float`
- `FluidProperties.get_specific_heat(fluid_type: str, temp_k: float) -> float`
- `FluidProperties.get_valve_fr(reynolds: float) -> float` (viscous laminar correction for valves)
- `FluidProperties.get_filter_viscosity_factor(reynolds: float) -> float`

Supported fluid types include `'water'`, `'iso_vg_32'`, `'iso_vg_46'`, `'iso_vg_68'`, `'glycol_50'`, `'diesel'`, etc.

---

## 6. Mandatory Companion Documentation (`<equipment>.md`)

Every backend equipment file `backend/simulation/equipment/<name>.py` **must** be created with a paired markdown documentation file `backend/simulation/equipment/<name>.md`.

This documentation ensures full traceability between physics standards (e.g. ISO 5167, ISO 4126, IEC 60534, Crane TP 410) and code implementation.

See **[references/equipment-documentation-standard.md](file:///c:/Users/c563871/Coding/WalFlow/.agents/skills/equipment-creation/references/equipment-documentation-standard.md)** for the complete format template and guidelines.

