# Equipment Documentation Standard (`<equipment>.md`)

Every equipment class in the backend (`backend/simulation/equipment/<name>.py`) **must** have a documentation file in the same directory (`backend/simulation/equipment/<name>.md`).

The document makes the physics traceable for developers and engineering users: what the model is, which standard it follows, the exact equations the code solves, units, limits and the tests that prove it.

**Reference example:** [orifice.md](../../../../backend/simulation/equipment/orifice.md). When in doubt, copy its structure.

---

## 📋 Required Structure

Every document uses exactly these headings, in this order. Subsections (`### 3.1 ...`) are free.

```markdown
# <Equipment Name> (`<node_type>`)

## 1. Overview & Purpose
## 2. Governing Standards & Reference Literature
## 3. Physical & Mathematical Implementation
## 4. Thermal & Energy Balance
## 5. Parameter & Unit Specification Table
## 6. Operating Modes & Model Boundaries
## 7. Verification & Benchmarks
## Data Fields
```

`## Data Fields` is always the last section (a test reads it up to the end of the file).

### What goes in each section

1. **Overview & Purpose** — what the equipment is, its role in a P&ID, how it behaves in the network (resistance, flow boundary, pressure boundary, junction, thermal unit). Selectable models or standards listed in one short list.
2. **Governing Standards & Reference Literature** — the standards and books the equations come from, as a claim table `Claim | Type | Source (edition) | Used for | Status`. Each claim gets an ID and a row in [docs/STANDARDS_REGISTER.md](../../../../docs/STANDARDS_REGISTER.md) (with a new source row there if needed), and starts as ⚪ Unverified until it is checked against the source with the `standard-verification` skill. Cite with the edition (`ISO 5167-2:2022`, `API Std 520 Part I, 10th ed. (2020)`, books with edition and year). If several models are selectable, a table `value | model | notes` follows. If the component is a mathematical idealisation with no standard, say so in one line.
3. **Physical & Mathematical Implementation** — the equations **as the code implements them**, not as a textbook states them. Cover:
   - the primary relation ($\Delta P(Q, \rho, \mu)$, $H(Q)$, fixed $P$ or $Q$, mass balance, ...);
   - flow regimes and how they are blended ($C^0$ / $C^1$ continuity);
   - the derivative in the Newton Jacobian (analytical for pipes and pumps, numerical for the others);
   - the solver formulation (residual form, MCP Fischer-Burmeister, between-solve state updates);
   - clamps, regularisations and constants with their values.
   Name the method (`calculate_delta_p`, `_cd_rg_iso5167`, ...) where it helps a developer find the code.
4. **Thermal & Energy Balance** — the temperature change across the component (throttling $dT = |\Delta P| / (\rho\, C_p)$, pump waste heat, heat exchanger duty, adiabatic mixing, stamped boundary temperature).
5. **Parameter & Unit Specification Table** — the user inputs, with this table:

   | Parameter (UI Label) | UI Unit | Backend Var | SI Unit | Default | Valid Range | Description |
   | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

   `Backend Var` is the attribute on the equipment object (e.g. `self.flow_base`); the file field name is in `## Data Fields`.
6. **Operating Modes & Model Boundaries** — always cover:
   - steady state ($\Delta t = 0$, instantaneous algebraic equilibrium);
   - **solver flags** as a list: `is_pressure_boundary`, `blocks_flow_on_shutdown`, `use_mcp_formulation` with their values;
   - inactive / shutdown behaviour;
   - reverse flow;
   - operating case overrides;
   - what the model does **not** cover (validity range, fluids, effects left out) and design decisions behind it.
7. **Verification & Benchmarks** — the test files and test names that check the component, and the benchmark values **taken from the assertions in those tests** (input → expected result, tolerance). Never invent a number for the document. If no test checks the component with numbers, write `No dedicated benchmark.` and name the tests that cover it indirectly, if any.

### Sections that do not apply

Keep the heading and write one line saying why, e.g. `Not applicable — the junction has no pressure loss; its ports share one pressure.` Never drop a heading.

### Shared models

- When several components share one model (PSV and rupture disc share `relief_device.py`), the shared physics lives in its own document (`relief_device.md`) and each component document links to it and covers only its own differences.
- `base_node.md` documents the `HydraulicNode` contract (ports, solver flags, `calculate()` / residual / Jacobian contract) and the field naming rule, using the same headings. Its section 3 describes the contract instead of an equation.
- A document for a class that is not a node type (e.g. `relief_device.md`) has no `## Data Fields` section.
- Link to another document for anything it already explains (e.g. reservoir entry losses in [pipe.md](../../../../backend/simulation/equipment/pipe.md)) instead of repeating it.

---

## ✍️ Writing Style

The readers are developers and engineering users.

- Short, plain sentences. One fact per sentence.
- Equations in LaTeX (`$...$` inline, `$$...$$` display), SI units inside equations.
- Define every symbol the first time it appears.
- A small worked numeric table where it helps the reader judge magnitude (e.g. the entry-loss table in `pressure_source.md`).
- State a design decision and its reason where a reader would otherwise ask "why not ...?".
- No marketing words, no emojis in the equipment documents.

---

## Data Fields

The section starts with the node type line, then the table:

```markdown
## Data Fields

Node type: `node_type_string`. Field names follow the naming rule in [base_node.md](base_node.md), which also lists the fields of every component.

| Field | Unit in file | Default |
|---|---|---|
| `flow_base_lmin` | L/min | 10 |
| `restriction_model` | text (`orifice` / `laminar` / `quadratic`) | orifice |
```

Rules:

- List exactly the keys `GraphParser._build_node` reads from the node's `data` for this type (fields of every component, such as `label` and `active`, are in `base_node.md`). `backend/tests/unit/solver/test_node_fields_documented.py` fails when the parser and the tables differ, or when a node type has no section.
- Every dimensional field carries its unit in the name: `_pa`, `_bar`, `_barg`, `_bara`, `_lmin`, `_c`, `_k`, `_m`, `_mm`, `_kw`, `_w_k`, `_pct`, `_deg`, `_mpas`. The "Unit in file" column must match the suffix (the test checks it). Unitless fields (`text`, `bool`, `Cv`, `DN`, `index`, `catalogue id`) have no suffix.
- Renaming an existing field: before a release, rename it everywhere (saved files are not converted). After a release, a rename is a file format incompatibility and follows the Versioning Policy in `AGENTS.md`.
