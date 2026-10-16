// Content of the Help modal's User Guide and Model & limits tabs.
// Plain text units (bar(a), L/min, °C) are used instead of LaTeX so nothing renders as raw markup.
const b = (text) => <strong>{text}</strong>;

export const GUIDE_SECTIONS = [
  {
    title: '1. Build the diagram',
    items: [
      <>{b('Add components:')} drag pumps, tanks, valves, regulators, orifices, filters, heat exchangers, relief devices and junctions from the left sidebar onto the canvas. Right-click the canvas, a component or a pipe for a context menu.</>,
      <>{b('Connect ports:')} drag from an outlet handle to an inlet handle to create a pipe. A port takes one pipe; use a splitter or mixer to branch. Drag the signal handles for control connections.</>,
      <>{b('Edit properties:')} click a component or pipe to open its inspector on the right. Pipe size, schedule and piping spec are also editable in the data list below the canvas.</>,
      <>{b('Layout:')} the data list below the canvas can be resized with its drag handle (arrow keys work too) and collapsed.</>,
    ],
  },
  {
    title: '2. Settings: Drawing, Project and Global',
    items: [
      <>{b('Drawing')} (saved in the .wlf file): title, description, fluid, ambient and atmospheric pressure, and the solver group when {b('use drawing solver settings')} is ticked.</>,
      <>{b('Project')} (cloud projects): piping specs, whether custom pipes are allowed, and the solver group when {b('use project solver settings')} is ticked. Only the project owner edits it.</>,
      <>{b('Global')} (your account, or this browser when signed out): display units and the default solver group.</>,
      <>Precedence is Drawing, then Project, then Global; a group is taken whole from the highest level that has it ticked. A new drawing starts from the built-in defaults.</>,
    ],
  },
  {
    title: '3. Run a simulation',
    items: [
      <>Click {b('Run Simulation')} in the top bar. The model is checked first: errors (empty drawing, unknown component, several pipes on one port) block the run; warnings (open ports, self-loops, isolated components, a circuit without tank or source, unwired instruments) still allow it.</>,
      <>The {b('status chip')} next to the case switcher shows the state: not connected, running, converged, converged with warnings, failed, or out of date after you changed the drawing. Click it to see the checks, the notes from the last run and a Show button that selects the affected item.</>,
      <>Banners over the canvas report vacuum or sub-vapour-pressure ports, fluid temperatures outside the property range, and values the solver could not return.</>,
      <>Results appear on the components, on the pipes and in the data list. A dash ("-") means there is no result yet.</>,
    ],
  },
  {
    title: '4. Operating cases and batch solve',
    items: [
      <>Use {b('New Case')} to copy the active case under a name you give. Cases hold overrides such as valve openings and pump speeds; the base case holds the drawing values.</>,
      <>The {b('Operating Cases Matrix')} compares key results across cases. {b('Batch Solve Matrix')} runs all cases at once. Batch Solve does not run the model checks, so run the base case first.</>,
      <>The {b('Relief Analysis Matrix')} lists each relief device with its set or burst rating and result per case.</>,
    ],
  },
  {
    title: '5. Heatmap and results',
    items: [
      <>Toggle the heatmap in the canvas controls to colour pipes by pressure (bar(a)), temperature (°C), volume flow (L/min) or velocity (m/s). The legend shows the numeric range; switch off auto-scale to set your own limits.</>,
      <>Velocity above 2.5 m/s and 4 m/s is marked with a symbol and a tooltip in addition to colour.</>,
      <>Pressure drops and pump rises are shown as positive ΔP values. Pump and valve curves are in the inspector.</>,
    ],
  },
  {
    title: '6. Measurement taps and instruments',
    items: [
      <>A {b('Tap')} marks a point in a line without pressure drop; its yellow pin is a measuring location, like the pin on any component port. Right-click a pipe and choose {b('Insert tap')} to split it in two.</>,
      <>An {b('Instrument')} bubble shows one variable (pressure, ΔP, flow, temperature, velocity or viscosity) read at a pin. Drag a signal line from a pin to the bubble, or right-click a tap or pin and choose {b('Add instrument')}. A ΔP instrument needs both its (+) and (−) inputs.</>,
      <>Alarm limits LL, L, H and HH are set per instrument and apply to every case; the value badge turns orange (H, L) or red (HH, LL). Alarms are indication only: they never act on the model.</>,
      <>The {b('Measurements')} tab in the data list shows every instrument with editable limits and its reading per case, so you can see which case trips an alarm. Use {b('Solve all cases')} to fill all columns.</>,
    ],
  },
  {
    title: '7. Save, load and examples',
    items: [
      <>{b('Export / Import')} saves and loads .wlf files (older .json files also open); you can drop a file onto the canvas. Results are not stored in the file; run the simulation again after loading.</>,
      <>Signed-in users can save drawings to cloud projects. A draft is also kept in this browser and offered again after a crash or reload.</>,
      <>The scenario templates in the sidebar are worked examples; each has a note saying what to check.</>,
    ],
  },
];

export const MODEL_SECTIONS = [
  {
    title: 'What the solver does',
    items: [
      <>WalFlow is a {b('steady-state')} hydraulic simulator. It solves the algebraic balance of pressures, flows, temperatures and velocities for the drawing as it is. There is no time stepping, so it does not model accumulator or tank filling over time, valve stroking, pump start-up or water hammer (transients).</>,
      <>Mass balance holds at every junction; every component contributes a pressure-flow relation (pump curve, valve Cv, orifice, filter, regulator set point and so on). The system is solved with a sparse Newton method, with a Levenberg-Marquardt fallback.</>,
    ],
  },
  {
    title: 'Pipe friction',
    items: [
      <>Pipe losses use the {b('Darcy-Weisbach')} equation. The friction factor comes from the Churchill (1977) correlation, which is continuous from laminar through transition to turbulent flow and uses the wall roughness of the piping spec.</>,
    ],
  },
  {
    title: 'Fluids and property ranges',
    items: [
      <>Density, viscosity and vapour pressure come from built-in correlations or tables per fluid. Each fluid is valid over a limited temperature range, for example water 0 to 150 °C, seawater 0 to 80 °C, glycol mixtures about -20 to 80 °C, ISO VG oils about -30 to 120 °C and thermal oil -5 to 250 °C.</>,
      <>Outside its range a fluid is not extrapolated silently: the run reports a temperature-out-of-range note. One fluid applies to the whole drawing.</>,
    ],
  },
  {
    title: 'Control valves',
    items: [
      <>Valve flow uses Cv. The viscosity correction is a {b('simplified')} version of the IEC 60534-2-1 Reynolds factor Fr and is applied as a smooth blend. Against the standard it agrees within about 12 % up to 30 cSt; at up to 1000 cSt it can be 0.7 to 1.7 times the standard value. Choked (cavitating or flashing) flow limits, the FL factor and pipe-reducer corrections are not included.</>,
      <>For viscous service or large pressure ratios, check valve sizing with the manufacturer's data.</>,
    ],
  },
  {
    title: 'Not checked by WalFlow',
    items: [
      <>Pipe class pressure rating, P-T ratings and corrosion allowance are stored for reference only; the solver does not compare results with them.</>,
      <>Pump run-out, minimum flow, velocity limits and relief-valve sizing against a code are not evaluated or flagged in general; only the cavitation, vacuum and velocity-marker notes described above are. Always review results against the applicable standards.</>,
    ],
  },
];
