# Component Link (`ComponentLink`)

## 1. Overview & Purpose

An in-line component with neutral ports ([orifice](orifice.md), [calibrated restriction](calibrated_restriction.md), [filter](filter.md)) is an edge of the solve, as EPANET models a valve: a link from a hidden node at its port 0 to a hidden node at its port 1. The component has no inlet or outlet; the sign of the solved flow picks its upstream port. Both hidden nodes are solved, so each component port has a solved pressure like any node port: it can be sensed by a remote control valve or a pilot relief valve, and a dead leg or a line of components without another node needs no special case.

It is not a canvas component. The graph parser (`_build_component_links`) builds it; the solver uses it through the Pipe interface.

## 2. Governing Standards & Reference Literature

No claim of its own: the component keeps its law and its references.

## 3. Physical & Mathematical Implementation

### 3.1 Building the links

For each in-line component the parser adds two hidden two-port junctions, `<id>#port-0` and `<id>#port-1`. The pipe drawn to component port $k$ ends on port 0 of junction $k$; the link runs from port 1 of junction 0 to port 1 of junction 1. A free component port leaves its junction with the link only: a dead leg without flow. A component port takes one pipe.

Pipes keep their drawn direction. A pipe runs from an outlet to an inlet: a role port at its source must be an outlet, at its target an inlet, else the parser raises a `ModelInputError` (the canvas stores every pipe that way).

### 3.2 Edge row

With edge flow $Q$ (volume flow at the density where it arrives, as for a pipe edge), the component takes its upstream volume flow $Q_u = Q\,\rho_{\text{arr}} / \rho_u$, as it took its inlet volume flow when it was a node:

$$\Delta P_{\text{link}}(Q) = \operatorname{sign}(Q_u)\,\Delta P(|Q_u|, \rho_u, \mu_u)$$

on the total pressures of the two hidden nodes, at the fluid of the upstream port from the last property pass (held fixed during a solve). A component with a pipe bore (orifice $\beta$, calibrated restriction) takes the bore of the pipe on the upstream port in each property pass, the other pipe on a free port; without flow ($|Q| \le$ `Q_DEAD_LEG`) it keeps its bore, so solver noise around zero does not swap it. The slope is a central difference.

### 3.3 Reporting

The link's end velocity heads are those of the pipes on the two ports, so each hidden junction reports one static pressure (total pressure minus the pipe's velocity head). `report()` copies static pressure, total pressure and fluid from the hidden junctions to the component's ports, with the flow at each port's density, positive into the component.

## 4. Thermal & Energy Balance

The property pass sets the downstream end to the upstream fluid plus the throttling heat $\Delta T = |\Delta P| / (\rho\, c_p(T))$; the hidden junction downstream mixes it like any arriving edge.

## 5. Parameter & Unit Specification Table

No user parameters.

## 6. Engineering Limitations & Solver Boundaries

- Each component adds two nodes and one edge to the solve (a role-port component adds one node).
- The throttling heat reaches the downstream junction one property pass later. The property passes stop once every temperature moves less than 0.01 K per pass, so a component whose $\Delta T$ is below 0.01 K (a clean filter: about 0.009 K at 0.16 bar of oil) can report a smaller rise. Its pressure and flow are unaffected.
- The hidden junctions are left out of the telemetry; the component reports on `ports[k]`. Messages name the component, not its hidden nodes: an island error lists the component, a physical-validity issue the component's `port-k`.

## 7. Verification Tests

Covered by the property tests on drawing direction and port order and by the golden examples.

## 8. Boundary Link

`BoundaryLink` is the edge from a [flow boundary](flow_boundary.md#32-hidden-port-nodes-and-links) to the hidden junction at its port(s). It has no pressure drop and no slope, so the hidden junction is at the outlet pressure of the boundary's flow spring; the property pass carries the upstream fluid across unchanged. Its end velocity heads are those of the one pipe on the hidden junction (0 when several pipes share it), so the boundary's outlet and its port report the static pressure at that pipe's end. It is left out of the edge telemetry.
