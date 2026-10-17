---
name: pipe-classes
description: Knowledge and operational guide for managing and modeling pipe classes in WalFlow, integrating with Equinor TR2000 REST API, project-level spec filtering, and edge hydraulic properties.
argument-hint: "[pipe-class-code or standard-name]"
license: MIT
metadata:
  version: "1.0.0"
---

# Pipe Classes in WalFlow

This skill guides AI agents and engineers in understanding, managing, creating, and simulating **pipe classes** in WalFlow. The UI calls them "Pipe classes" everywhere (not "pipe specifications").

---

## 🧭 Overview & Core Principles

WalFlow uses an industrial **pipe class catalog** model. Pipe classes and the fitting catalogs (pipe schedules, reducers) live in the same database (`pipe_classes` and `fitting_standards` tables); catalog data is never hard-coded in the frontend.
1. **Piping Classes (`PipeClass`)**: Define engineering properties for a class of pipes, including material group (`CS`, `316SS`, `DX`, `TI`), material grade (`ASTM A106 Gr. B`), pressure rating (`CL150`, `CL300`, `PN16`), design code (`ASME B31.3`), absolute surface roughness $\epsilon$ (in mm), corrosion allowance $CA$ (in mm), and design temperature range ($T_{min} \dots T_{max}$).
2. **Catalogs and sizes**: A class selects one or more pipe dimension catalogs (`schedule_standard_codes`) and reducer catalogs (`reducer_standard_codes`); the first of each list is the default. Each size row references a catalog entry (catalog + DN + schedule); NPS, Outer Diameter ($OD$) and Wall Thickness ($WT$) are looked up in the catalog on every request, and the clean Internal Diameter is
   $$ID = OD - 2 \cdot WT$$
   Sizes that no selected catalog lists are stored as custom rows with their own dimensions.
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
    is_builtin: bool               # True for the shipped example classes (badge only, editable)
    schedule_standard_codes: str   # JSON list of pipe schedule catalog codes, default first
    reducer_standard_codes: str    # JSON list of reducer catalog codes, default first
    schedule_standard_code: str    # = first of the list (kept for older readers)
    reducer_standard_code: str     # = first of the list (kept for older readers)
    sizes_json: str                # JSON array of size references / custom rows
    temp_pressures_json: str       # JSON array of P-T rating points
```

### Schedule Standards (`schedule_standard_code`)

| Code | Content | Typical classes |
|---|---|---|
| `ASME_B36_10M_SCHEDULES` | STD, XS, Sch 10/20/30/40/60/80/160 | Carbon / low-temp steel |
| `ASME_B36_19M_SCHEDULES` | 5S, 10S, 40S, 80S (40S/80S to NPS 12) | Stainless, duplex |
| `DIN_EN_PIPE_SCHEDULES` | Normal, Heavy, ISO 1127 | EN design codes |

A class only offers the schedules of the catalogs it selects. A spec that mixes series (e.g. duplex 10S with Sch 160 small bore) selects both B36.19M and B36.10M. The seed data is in `backend/services/fitting_defaults.py`; it fills an empty database and is used by Restore Defaults. The frontend reads catalogs only from `GET /api/fitting-standards` (`useFittingStandards`); frontend tests load the seed from `src/test/fixtures/catalogs.json`.

Schedule names are shown as in the catalog view: numeric designations get a "Sch" prefix (`Sch 40`, `Sch 10S`), others stay (`STD`, `XS`, `Normal`). Stored keys are unchanged (`40`, `10S`).

### Size JSON Format (`sizes_json`)
Stored rows are references, or custom rows for sizes no catalog lists:
```json
[
  {"dn": 50, "catalog": "ASME_B36_10M_SCHEDULES", "sch": "STD", "ca_mm": 3.0},
  {"dn": 1100, "custom": true, "nps": "44", "od_mm": 1117.6, "wt_mm": 12.7, "sch": "XS", "ca_mm": 3.0}
]
```
API responses add `nps`, `od_mm`, `wt_mm`, `id_mm` to every row (looked up in the catalog); a reference whose catalog entry is gone is returned with `unresolved: true`. Rows posted with dimensions but no catalog (older clients, old library files) are matched to a catalog row (OD ± 0.15 mm, WT ± 0.01 mm); library import and TR2000 sync turn unmatched rows into custom rows, the create/update API rejects them.

---

## 🔌 REST API Endpoints (`/api/pipe-classes`)

* `GET /api/pipe-classes` — List all pipe classes (filter by `standard`, `material_group`, `q`).
* `GET /api/pipe-classes/{id_or_code}` — Retrieve a pipe class with its sizes (dimensions looked up in the catalog) and P-T curve.
* `POST /api/pipe-classes` — Create custom pipe class (Requires `admin` or `pipe_manager` role).
* `PUT /api/pipe-classes/{id_or_code}` — Update a pipe class (examples are editable; `is_builtin` is a badge only). Size rows must use a selected catalog that lists the DN and schedule, DNs are unique, and a catalog in use cannot be deselected. P-T points are sorted; Tmin/Tmax must lie on the curve.
* `DELETE /api/pipe-classes/{id_or_code}` — Delete a pipe class; its id and code are removed from every project's `allowed_pipe_classes`. Examples are seeded only on an empty table (restore with `POST /seed-examples`).
* `GET /api/pipe-classes/tr2000/plants` — List Equinor TR2000 plants (default `UON` / 109).
* `GET /api/pipe-classes/tr2000/search` — Search PCS specifications within a plant.
* `POST /api/pipe-classes/tr2000/sync` — Ingest a TR2000 PCS into the local DB as a pipe class (catalog-matching sizes become references, others custom rows). **Requires `agreed_to_terms: true`** to comply with Equinor Terms and Conditions.

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
