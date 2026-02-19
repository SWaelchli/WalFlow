import numpy as np
from scipy.optimize import root
from typing import List

from simulation.equipment.base_node import HydraulicNode
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice


class NetworkSolver:
    """
    The mathematical engine of WalFlow. 
    It evaluates the hydraulic nodes and finds the steady-state operating conditions.
    """
    def __init__(self, nodes: List[HydraulicNode]):
        self.nodes = nodes
        
        # For our Phase 2 MVP, we will extract the specific components 
        # to solve a simple 1D series circuit (Tank -> Pipe -> Tank)
        self.tanks = [n for n in nodes if isinstance(n, Tank)]
        self.pipes = [n for n in nodes if isinstance(n, Pipe)]
        self.orifices = [n for n in nodes if isinstance(n, Orifice)]

    def objective_function(self, flows: np.ndarray) -> np.ndarray:
        """
        This is the function SciPy will try to force to zero.
        It takes a guessed flow rate, calculates the resulting pressure, 
        and returns the error (residual).
        """
        # flows[0] is the solver's current guess for the volumetric flow rate (Q)
        q_guess = flows[0]
        
        tank_in = self.tanks[0]
        pipe = self.pipes[0]
        orifice = self.orifices[0]
        tank_out = self.tanks[1]
        
        # 1. Get the starting boundary pressure from the first tank
        p_start = tank_in.calculate()
        
        # 2.a Calculate the pressure drop across the pipe based on the guessed flow.
        # (Assuming standard water density of 1000.0 kg/m^3 for now)
        dp_pipe = pipe.calculate_delta_p(q_guess, density=1000.0)
        
        # 2.b Calculate the pressure drop across the orifice based on the guessed flow.
        dp_orifice = orifice.calculate_delta_p(q_guess, density=1000.0)
        
        # 3. Calculate what the end pressure *should* be
        p_end_calculated = p_start - dp_pipe - dp_orifice
        
        # 4. Get the actual fixed boundary pressure of the destination tank
        p_end_boundary = tank_out.calculate()
        
        # 5. Calculate the error. If this is 0, our guess was perfect.
        error = p_end_calculated - p_end_boundary
        
        return np.array([error])

    def solve(self) -> float:
        """
        Executes the iterative solver to find the exact flow rate.
        """
        if len(self.tanks) < 2 or len(self.pipes) < 1:
            raise ValueError("Network needs at least 2 Tanks and 1 Pipe to solve.")

        # Provide an initial guess for the flow rate (0.1 m^3/s)
        initial_guess = np.array([0.1])
        
        # Run SciPy's root finding algorithm (hybr is a robust Newton-Raphson hybrid)
        solution = root(self.objective_function, initial_guess, method='hybr')
        
        if solution.success:
            final_q = solution.x[0]
            # Update the pipe's internal state with the final correct answer
            self.pipes[0].inlets[0].flow_rate = final_q
            self.pipes[0].calculate() 

            # Update the orifice's internal state with the final correct answer
            self.orifices[0].inlets[0].flow_rate = final_q
            self.orifices[0].calculate()
            
            return final_q
        else:
            raise ValueError(f"Solver failed to converge: {solution.message}")