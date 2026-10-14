---
name: pipe-classes
description: Knowledge and operational guide for managing and modeling piping specifications (Pipe Classes) in WalFlow, integrating with Equinor TR2000 REST API, project-level spec filtering, and edge hydraulic properties.
argument-hint: "[pipe-class-code or standard-name]"
license: MIT
metadata:
  version: "1.0.0"
---

# Pipe Classes & Piping Specifications in WalFlow

This skill guides AI agents and engineers in understanding, managing, creating, and simulating **Piping Specifications (Pipe Classes)** in WalFlow.

---

## 🧭 Overview & Core Principles

WalFlow uses an industrial **Pipe Class Specification Catalog** model:
1. **Piping Classes (`PipeClass`)**: Define engineering properties for a class of pipes, including material group (`CS`, `316SS`, `DX`, `TI`), material grade (`ASTM A106 Gr. B`), pressure rating (`CL150`, `CL300`, `PN16`), design code (`ASME B31.3`), absolute surface roughness $\epsilon$ (in mm), corrosion allowance $CA$ (in mm), and design temperature range ($T_{min} \dots T_{max}$).
2. **Size Schedules**: Each pipe class stores a table of supported nominal sizes ($DN / NPS$) containing Outer Diameter ($OD$), Wall Thickness ($WT$), Schedule designation (`STD`, `40`, `80`, `10S`, `160`), and calculated clean Internal Diameter:
   $$ID = OD - 2 \cdot WT$$
3. **Equinor TR2000 Integration**: WalFlow directly connects to Equinor's TR2000 REST API (`https://equinor.pipespec-api.presight.com`), allowing on-demand synchronization of official line classes (e.g. `AC140`, `AC111`, `AS300`, `DX`). Default library plant is `UON` (PlantID=109 - US Onshore PCS Library).
4. **Project-Level Applicable Specs**: When a drawing belongs to a cloud project, project managers can restrict which pipe classes are selectable. When standalone/unassigned, all classes are available.
5. **Localized Surface Roughness**: Surface roughness is strictly localized per pipe edge and auto-derived from the pipe class material. Global canvas roughness has been removed.

---

## 🔬 Material Surface Roughness ($\epsilon$) Standards

| Material Group | Common Material Grades | Surface Roughness $\epsilon$ (mm) | Surface Roughness $\epsilon$ (m) |
|---|---|---|---|
| **Carbon Steel (`CS`, `CSLT`, `CSNT`)** | ASTM A106 Gr. B, ASTM A333 Gr. 6, API 5L Gr. B | $0.045\text{ mm}$ | $0.000045\text{ m}$ ($45\ \mu\text{m}$) |
| **Stainless Steel (`316SS`, `304SS`, `SS`)** | ASTM A312 TP316L, ASTM A312 TP304 | $0.015\text{ mm}$ | $0.000015\text{ m}$ ($15\ \mu\text{m}$) |
| **Duplex / Super Duplex (`DX`, `SDX`, `22Cr`, `25Cr`)** | UNS S31803 (2205), UNS S32750 (2507) | $0.015\text{ mm}$ | $0.000015\text{ m}$ ($15\ \mu\text{m}$) |
| **Titanium (`TI`)** | ASTM B861 Gr. 2 | $0.005\text{ mm}$ | $0.000005\text{ m}$ ($5\ \mu\text{m}$) |
| **Plastics / Smooth Tubing (`PVC`, `GRP`)** | Thermoplastics, GRP | $0.005 - 0.010\text{ mm}$ | $0.000005 - 0.000010\text{ m}$ |

---

## 🗄️ Database & Schema Reference

Pipe classes are stored in the `pipe_classes` table via SQLAlchemy:

```python
class PipeClass(Base):
    id: str                        # UUID primary key
    code: str                      # Unique class code (e.g. "CS01", "AC140")
    name: str                      # Descriptive title
    standard: str                  # "WALFLOW_EXAMPLE" | "TR2000" | "CUSTOM"
    material_group: str            # "CS", "316SS", "DX", etc.
    material_grade: str            # "ASTM A106 Gr. B"
    rating_class: str              # "CL150", "CL300"
    design_code: str               # "ASME B31.3"
    roughness_mm: float            # Surface roughness in mm
    corrosion_allowance_mm: float  # Base CA in mm
    min_temp_c: Optional[float]    # Min design temperature in °C
    max_temp_c: Optional[float]    # Max design temperature in °C
    revision: str                  # "1.0", "A", "B"
    source_plant_id: Optional[int] # Equinor TR2000 Plant ID (e.g. 109)
    is_builtin: bool               # True for standard shipped classes (read-only)
    sizes_json: str                # JSON array of size entries
    temp_pressures_json: str       # JSON array of P-T rating points
```

### Size Grid JSON Format (`sizes_json`)
```json
[
  {
    "dn": 50,
    "nps": "2",
    "od_mm": 60.3,
    "wt_mm": 3.91,
    "id_mm": 52.48,
    "sch": "STD",
    "ca_mm": 3.0
  }
]
```

---

## 🔌 REST API Endpoints (`/api/pipe-classes`)

* `GET /api/pipe-classes` — List all pipe classes (filter by `standard`, `material_group`, `q`).
* `GET /api/pipe-classes/{id_or_code}` — Retrieve specification details with sizes and P-T curves.
* `POST /api/pipe-classes` — Create custom pipe class (Requires `admin` or `pipe_manager` role).
* `PUT /api/pipe-classes/{id_or_code}` — Update custom pipe class (Built-ins are protected).
* `DELETE /api/pipe-classes/{id_or_code}` — Delete custom pipe class (Built-ins are protected).
* `GET /api/pipe-classes/tr2000/plants` — List Equinor TR2000 plants (default `UON` / 109).
* `GET /api/pipe-classes/tr2000/search` — Search PCS specifications within a plant.
* `POST /api/pipe-classes/tr2000/sync` — Ingest PCS specification into local DB. **Requires `agreed_to_terms: true`** to comply with Equinor Terms and Conditions.

---

## 🎨 Diagram Format (.wlf v0.2) Edge Representation

Hydraulic edges in WalFlow format version `0.2` store:

```json
{
  "id": "edge_pipe_01",
  "source": "node_pump_1",
  "target": "node_valve_1",
  "sourceHandle": "outlet-0",
  "targetHandle": "inlet-0",
  "data": {
    "label": "Pipe 101",
    "length": 25.0,
    "diameter": 0.05248,
    "pipe_class_id": "walflow-cs01",
    "pipe_class_code": "CS01",
    "standardDn": 50,
    "standardSch": "STD",
    "roughness_mm": 0.045,
    "roughness": 0.000045,
    "outer_diameter_mm": 60.3,
    "wall_thickness_mm": 3.91
  }
}
```

---

## ⚖️ Legal & Compliance Note
Equinor TR2000 is proprietary engineering standard data owned by **Equinor ASA**. Users downloading or syncing TR2000 line classes must review and agree to the official [Equinor Terms and Conditions](https://www.equinor.com/about-us/terms-and-conditions).
