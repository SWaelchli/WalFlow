import numpy as np
from scipy.optimize import root
from typing import List

from simulation.equipment.base_node import HydraulicNode
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.valve import Valve
from simulation.equipment.pump import Pump


class NetworkSolver:
    """
    The mathematical engine of WalFlow. 
    It evaluates the hydraulic nodes and finds the steady-state operating conditions.
    """
    def __init__(self, nodes: List[HydraulicNode]):
        self.nodes = nodes
        
    def objective_function(self, flows: np.ndarray) -> np.ndarray:
        """
        Calculates the residual error in the energy balance across the network.
        Now dynamically handles any number of nodes in series.
        """
        q_guess = flows[0]
        density = 1000.0  # Assuming water for Phase 7
        
        if not self.nodes:
            return np.array([0.0])
            
        # 1. Starting boundary pressure from the first node (must be a Tank)
        if not isinstance(self.nodes[0], Tank):
            raise ValueError("The first node in the circuit must be a Tank.")
        
        current_p = self.nodes[0].calculate()
        
        # 2. Iterate through all intermediate nodes to calculate the cumulative pressure
        for node in self.nodes[1:-1]:
            if isinstance(node, Pump):
                dp = node.calculate_delta_p(q_guess, density)
                current_p += dp
            elif hasattr(node, 'calculate_delta_p'):
                # Pipe, Valve, Orifice are resistances
                dp = node.calculate_delta_p(q_guess, density)
                current_p -= dp
            else:
                # If a node doesn't have calculate_delta_p, it's just a pass-through for now
                pass

        # 3. Final calculated pressure vs. the last node's boundary pressure
        last_node = self.nodes[-1]
        if not isinstance(last_node, Tank):
            raise ValueError("The last node in the circuit must be a Tank.")
            
        p_end_boundary = last_node.calculate()
        
        # 4. Calculate the residual (error)
        error = current_p - p_end_boundary
        
        return np.array([error])

    def solve(self) -> float:
        """
        Executes the iterative solver to find the exact flow rate.
        """
        if len(self.nodes) < 2:
            raise ValueError("Network needs at least 2 nodes to solve.")

        # Provide an initial guess for the flow rate (0.1 m^3/s)
        initial_guess = np.array([0.1])
        
        # Run SciPy's root finding algorithm 
        solution = root(self.objective_function, initial_guess, method='lm')
        
        # Check if SciPy claims success AND the final error is actually near zero
        if solution.success and abs(solution.fun[0]) < 0.1:
            final_q = solution.x[0]
            density = 1000.0 # Assuming water for now
            
            # --- State Propagation: Update all Ports with final results ---
            
            # Start with the first tank
            current_p = self.nodes[0].calculate()
            
            # Set the first node (Tank) outlet
            if self.nodes[0].outlets:
                self.nodes[0].outlets[0].flow_rate = final_q
                self.nodes[0].outlets[0].pressure = current_p
            
            # Propagate through the chain
            for node in self.nodes[1:]:
                # Every node's inlet is the previous node's outlet
                if node.inlets:
                    node.inlets[0].flow_rate = final_q
                    node.inlets[0].pressure = current_p
                
                # Calculate the pressure change across this node
                if isinstance(node, Pump):
                    dp = node.calculate_delta_p(final_q, density)
                    current_p += dp
                elif hasattr(node, 'calculate_delta_p'):
                    dp = node.calculate_delta_p(final_q, density)
                    current_p -= dp
                elif isinstance(node, Tank):
                    # For the last tank, we just use its boundary pressure
                    current_p = node.calculate()
                
                # Set this node's outlet pressure
                if node.outlets:
                    node.outlets[0].flow_rate = final_q
                    node.outlets[0].pressure = current_p

            return final_q
        else:
            raise ValueError(f"Solver failed to balance energy. Final error: {solution.fun[0]:.2f} Pa")
