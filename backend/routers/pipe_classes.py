import json
import logging
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session, object_session

from db.database import get_db
from db.models import PipeClass, User, Project
from auth import get_current_user, get_current_pipe_manager_user
from routers.projects import _parse_allowed_pipe_classes
from services.pipe_class_catalog import (
    DEFAULT_REDUCER_CATALOG, DEFAULT_SCHEDULE_CATALOG, Catalogs, catalog_type_errors, custom_row,
    load_schedule_catalogs, match_catalog_size, normalize_codes, reference_rows_from_dimensions,
    resolve_sizes, size_errors, storage_row,
)

router = APIRouter(prefix="/api/pipe-classes", tags=["pipe-classes"])


# --- Pydantic Schemas ---

class PipeSizeEntry(BaseModel):
    """A size row: a reference (catalog + DN + sch) or, with `custom`, a size with its own dimensions.
    Rows with dimensions but no catalog (older clients) are matched to the class's catalogs."""
    dn: int = Field(..., gt=0, description="Nominal diameter in mm")
    catalog: Optional[str] = Field(None, description="Pipe schedule catalog code the size is taken from")
    sch: Optional[str] = Field(None, description="Schedule designation in the catalog (e.g. STD, 40, 10S)")
    ca_mm: Optional[float] = Field(0.0, ge=0, description="Size-specific corrosion allowance in mm")
    custom: bool = Field(False, description="Size not taken from a catalog; nps/od_mm/wt_mm are stored")
    nps: Optional[str] = Field(None, description="Nominal pipe size (custom rows)")
    od_mm: Optional[float] = Field(None, gt=0, description="Outer diameter in mm (custom rows)")
    wt_mm: Optional[float] = Field(None, gt=0, description="Wall thickness in mm (custom rows)")



class TempPressureEntry(BaseModel):
    temp_c: float = Field(..., description="Temperature point in °C")
    press_bar: float = Field(..., ge=0, description="Max allowable pressure in bar")


class PipeClassCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64, description="Pipe class code (e.g. CS01, AC111)")
    name: str = Field(..., min_length=1, max_length=255, description="Descriptive name")
    standard: str = Field("CUSTOM", description="Standard framework (WALFLOW_EXAMPLE, TR2000, CUSTOM)")
    material_group: str = Field(..., description="Material group code (e.g. CS, CSLT, 316SS, DX, TI)")
    material_grade: str = Field(..., description="Material grade description (e.g. ASTM A106 Gr. B)")
    rating_class: str = Field(..., description="Rating class (e.g. CL150, CL300, PN16)")
    design_code: str = Field("ASME B31.3", description="Design code")
    reducer_standard_codes: Optional[List[str]] = Field(None, description="Reducer catalogs of the class, default first")
    schedule_standard_codes: Optional[List[str]] = Field(None, description="Pipe schedule catalogs of the class, default first")
    reducer_standard_code: Optional[str] = Field(None, description="Single reducer catalog (older clients)")
    schedule_standard_code: Optional[str] = Field(None, description="Single pipe schedule catalog (older clients)")
    roughness_mm: float = Field(0.045, gt=0, description="Absolute surface roughness in mm")
    corrosion_allowance_mm: float = Field(0.0, ge=0, description="Base corrosion allowance in mm")
    min_temp_c: Optional[float] = Field(None, description="Minimum allowable design temperature in °C")
    max_temp_c: Optional[float] = Field(None, description="Maximum allowable design temperature in °C")
    revision: str = Field("1.0", description="Specification revision")
    rev_date: Optional[str] = Field(None, description="Specification revision date")
    source_plant_id: Optional[int] = Field(None, description="Equinor TR2000 plant ID if synced")
    sizes: List[PipeSizeEntry] = Field(..., min_length=1, description="Array of supported nominal sizes")
    temp_pressures: Optional[List[TempPressureEntry]] = Field(default_factory=list, description="P-T rating points")


class PipeClassUpdate(BaseModel):
    name: Optional[str] = None
    material_group: Optional[str] = None
    material_grade: Optional[str] = None
    rating_class: Optional[str] = None
    design_code: Optional[str] = None
    reducer_standard_codes: Optional[List[str]] = None
    schedule_standard_codes: Optional[List[str]] = None
    reducer_standard_code: Optional[str] = None
    schedule_standard_code: Optional[str] = None
    roughness_mm: Optional[float] = Field(None, gt=0)
    corrosion_allowance_mm: Optional[float] = Field(None, ge=0)
    min_temp_c: Optional[float] = None
    max_temp_c: Optional[float] = None
    revision: Optional[str] = None
    rev_date: Optional[str] = None
    sizes: Optional[List[PipeSizeEntry]] = None
    temp_pressures: Optional[List[TempPressureEntry]] = None


class PipeClassResponse(BaseModel):
    id: str
    code: str
    name: str
    standard: str
    material_group: str
    material_grade: str
    rating_class: str
    design_code: str
    reducer_standard_codes: List[str]
    schedule_standard_codes: List[str]
    reducer_standard_code: str  # first of reducer_standard_codes (the default)
    schedule_standard_code: str  # first of schedule_standard_codes (the default)
    roughness_mm: float
    corrosion_allowance_mm: float
    min_temp_c: Optional[float] = None
    max_temp_c: Optional[float] = None
    revision: str
    rev_date: Optional[str] = None
    source_plant_id: Optional[int] = None
    is_builtin: bool
    sizes: List[Dict[str, Any]]
    temp_pressures: List[Dict[str, Any]]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


def _stored_sizes(item: PipeClass) -> List[Dict[str, Any]]:
    try:
        return json.loads(item.sizes_json) if item.sizes_json else []
    except Exception:
        return []


def _class_codes(item: PipeClass) -> tuple:
    """(schedule catalog codes, reducer catalog codes) of a class."""
    return (
        normalize_codes(item.schedule_standard_codes or item.schedule_standard_code, DEFAULT_SCHEDULE_CATALOG),
        normalize_codes(item.reducer_standard_codes or item.reducer_standard_code, DEFAULT_REDUCER_CATALOG),
    )


def _set_class_codes(item: PipeClass, schedule_codes: List[str], reducer_codes: List[str]) -> None:
    item.schedule_standard_codes = json.dumps(schedule_codes)
    item.schedule_standard_code = schedule_codes[0]
    item.reducer_standard_codes = json.dumps(reducer_codes)
    item.reducer_standard_code = reducer_codes[0]


def _serialize_pipe_class(item: PipeClass, catalogs: Optional[Catalogs] = None) -> Dict[str, Any]:
    """PipeClass as a dict; size rows carry NPS / OD / WT / ID looked up in the schedule catalogs."""
    schedule_codes, reducer_codes = _class_codes(item)
    stored = _stored_sizes(item)
    if catalogs is None:
        catalogs = load_schedule_catalogs(object_session(item), {r.get("catalog") for r in stored if r.get("catalog")})
    sizes = resolve_sizes(stored, catalogs)
    try:
        temp_pressures = json.loads(item.temp_pressures_json) if item.temp_pressures_json else []
    except Exception:
        temp_pressures = []

    return {
        "id": item.id,
        "code": item.code,
        "name": item.name,
        "standard": item.standard,
        "material_group": item.material_group,
        "material_grade": item.material_grade,
        "rating_class": item.rating_class,
        "design_code": item.design_code,
        "reducer_standard_codes": reducer_codes,
        "schedule_standard_codes": schedule_codes,
        "reducer_standard_code": reducer_codes[0],
        "schedule_standard_code": schedule_codes[0],
        "roughness_mm": item.roughness_mm,
        "corrosion_allowance_mm": item.corrosion_allowance_mm,
        "min_temp_c": item.min_temp_c,
        "max_temp_c": item.max_temp_c,
        "revision": item.revision,
        "rev_date": item.rev_date,
        "source_plant_id": item.source_plant_id,
        "is_builtin": item.is_builtin,
        "sizes": sizes,
        "temp_pressures": temp_pressures,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }



from services.tr2000_service import (
    fetch_tr2000_plants,
    search_tr2000_pcs,
    fetch_and_normalize_tr2000_pcs,
    DEFAULT_PLANT_ID
)


# --- Additional TR2000 Schemas ---

class TR2000SyncRequest(BaseModel):
    plant_id: int = Field(DEFAULT_PLANT_ID, description="Equinor plant ID (default 109: UON)")
    pcs_code: str = Field(..., min_length=1, description="PCS specification code (e.g. AC140, AC111)")
    rev_id: Optional[str] = Field(None, description="Specific revision ID (optional, defaults to latest)")
    agreed_to_terms: bool = Field(
        False,
        description="Explicit agreement to Equinor's Terms and Conditions (https://www.equinor.com/about-us/terms-and-conditions)"
    )
    conflict_action: Optional[str] = Field(
        "update",
        description="Action when code already exists: 'update' (overwrite), 'copy' (create with suffix), or 'skip'"
    )
    custom_code: Optional[str] = Field(None, description="Custom code name if creating as a copy")



# --- TR2000 Endpoints ---

@router.get("/tr2000/plants", response_model=List[Dict[str, Any]])
async def list_tr2000_plants(
    current_user: User = Depends(get_current_user)
):
    """Fetch available Equinor TR2000 plants, with US Onshore (UON/109) prioritized."""
    try:
        plants = await fetch_tr2000_plants()
        return plants
    except Exception as err:
        logging.error(f"TR2000 plants error: {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to communicate with Equinor TR2000 REST API. See the server log for details."
        )


@router.get("/tr2000/search", response_model=List[Dict[str, Any]])
async def search_tr2000_pipe_classes(
    plant_id: int = Query(DEFAULT_PLANT_ID, description="Equinor Plant ID (default 109 - UON)"),
    q: str = Query("", description="Filter PCS code, description, material"),
    current_user: User = Depends(get_current_user)
):
    """Search available PCS specifications in the selected Equinor TR2000 plant."""
    try:
        results = await search_tr2000_pcs(plant_id=plant_id, query=q)
        return results
    except Exception as err:
        logging.error(f"TR2000 search error: {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch TR2000 PCS specifications. See the server log for details."
        )


@router.post("/tr2000/sync", response_model=PipeClassResponse)
async def sync_tr2000_pipe_class(
    payload: TR2000SyncRequest,
    current_user: User = Depends(get_current_pipe_manager_user)
):
    """
    Ingest or update an Equinor TR2000 PCS specification into the local database.
    Requires acceptance of Equinor Terms and Conditions and admin or pipe_manager role.
    """
    if not payload.agreed_to_terms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "You must review and agree to Equinor's Terms and Conditions "
                "(https://www.equinor.com/about-us/terms-and-conditions) to download "
                "and maintain TR2000 pipe classes in WalFlow."
            )
        )

    try:
        normalized = await fetch_and_normalize_tr2000_pcs(
            plant_id=payload.plant_id,
            pcs_code=payload.pcs_code,
            rev_id=payload.rev_id
        )
    except ValueError as err:
        # Input problem (invalid code, unknown PCS): the message is ours and safe to show
        logging.warning(f"TR2000 sync rejected for {payload.pcs_code!r}: {err}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        logging.error(f"TR2000 sync error for {payload.pcs_code!r}: {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to retrieve the specification from the TR2000 API. See the server log for details."
        )

    from db.database import SessionLocal
    db = SessionLocal()
    try:
        target_code = payload.custom_code.upper().strip() if payload.custom_code else normalized["code"]
        # Sizes with catalog dimensions become references; the rest are imported as published (custom rows)
        preferred = normalize_codes(normalized.get("schedule_standard_code"), DEFAULT_SCHEDULE_CATALOG)
        size_rows, used_codes = reference_rows_from_dimensions(normalized["sizes"], load_schedule_catalogs(db), preferred)
        schedule_codes = used_codes or preferred
        reducer_codes = normalize_codes(normalized.get("reducer_standard_code"), DEFAULT_REDUCER_CATALOG)
        custom_dns = [r["dn"] for r in size_rows if r.get("custom")]
        if custom_dns:
            logging.warning(f"TR2000 {payload.pcs_code}: sizes not listed in a schedule catalog kept as custom rows: {custom_dns}")
        
        # Check if this class code already exists in local DB
        existing = db.query(PipeClass).filter(PipeClass.code == target_code).first()
        
        if existing:
            if payload.conflict_action == "skip":
                return _serialize_pipe_class(existing)
            elif payload.conflict_action == "copy" and not payload.custom_code:
                # Generate next available copy code e.g. AC140_1, AC140_2
                base_code = normalized["code"]
                counter = 1
                while db.query(PipeClass).filter(PipeClass.code == f"{base_code}_{counter}").first():
                    counter += 1
                target_code = f"{base_code}_{counter}"
                normalized["name"] = f"{normalized['name']} ({counter})"
                existing = None  # Proceed to create new class below

        if existing:
            # Update existing class in place
            existing.name = normalized["name"]
            existing.standard = "TR2000"
            existing.material_group = normalized["material_group"]
            existing.material_grade = normalized["material_grade"]
            existing.rating_class = normalized["rating_class"]
            existing.design_code = normalized["design_code"]
            _set_class_codes(existing, schedule_codes, reducer_codes)
            existing.roughness_mm = normalized["roughness_mm"]
            existing.corrosion_allowance_mm = normalized["corrosion_allowance_mm"]
            existing.min_temp_c = normalized["min_temp_c"]
            existing.max_temp_c = normalized["max_temp_c"]
            existing.revision = normalized["revision"]
            existing.rev_date = normalized.get("rev_date")
            existing.source_plant_id = normalized["source_plant_id"]
            existing.sizes_json = json.dumps(size_rows)
            existing.temp_pressures_json = json.dumps(normalized["temp_pressures"])
            db.commit()
            db.refresh(existing)
            return _serialize_pipe_class(existing)
        else:
            # Create new class
            new_class = PipeClass(
                code=target_code,
                name=normalized["name"],
                standard="TR2000",
                material_group=normalized["material_group"],
                material_grade=normalized["material_grade"],
                rating_class=normalized["rating_class"],
                design_code=normalized["design_code"],
                roughness_mm=normalized["roughness_mm"],
                corrosion_allowance_mm=normalized["corrosion_allowance_mm"],
                min_temp_c=normalized["min_temp_c"],
                max_temp_c=normalized["max_temp_c"],
                revision=normalized["revision"],
                rev_date=normalized.get("rev_date"),
                source_plant_id=normalized["source_plant_id"],
                is_builtin=False,
                sizes_json=json.dumps(size_rows),
                temp_pressures_json=json.dumps(normalized["temp_pressures"])
            )
            _set_class_codes(new_class, schedule_codes, reducer_codes)
            db.add(new_class)
            db.commit()
            db.refresh(new_class)
            return _serialize_pipe_class(new_class)

    finally:
        db.close()



# --- Core Pipe Classes CRUD Endpoints ---

@router.get("", response_model=List[PipeClassResponse])
def list_pipe_classes(
    standard: Optional[str] = Query(None, description="Filter by standard: WALFLOW_EXAMPLE, TR2000, CUSTOM"),
    material_group: Optional[str] = Query(None, description="Filter by material group"),
    q: Optional[str] = Query(None, description="Search query matching code, name, or material"),
    db: Session = Depends(get_db)
):
    """List all available pipe classes (standard built-ins and custom classes)."""
    query = db.query(PipeClass)
    if standard:
        query = query.filter(PipeClass.standard == standard)
    if material_group:
        query = query.filter(PipeClass.material_group == material_group)
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(
            (PipeClass.code.ilike(search_pattern)) |
            (PipeClass.name.ilike(search_pattern)) |
            (PipeClass.material_grade.ilike(search_pattern))
        )
    
    classes = query.order_by(PipeClass.is_builtin.desc(), PipeClass.code.asc()).all()
    catalogs = load_schedule_catalogs(db)
    return [_serialize_pipe_class(c, catalogs) for c in classes]


@router.get("/{class_id}", response_model=PipeClassResponse)
def get_pipe_class(class_id: str, db: Session = Depends(get_db)):
    """Retrieve full details and size table for a specific pipe class."""
    item = db.query(PipeClass).filter(
        (PipeClass.id == class_id) | (PipeClass.code == class_id)
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipe class with identifier '{class_id}' not found."
        )
    return _serialize_pipe_class(item)


def _codes_from(data: Dict[str, Any], list_field: str, single_field: str) -> Optional[List[str]]:
    """Catalog codes sent as a list or (older clients) as a single code; None when neither is sent."""
    if data.get(list_field) is not None:
        return normalize_codes(data[list_field])
    if data.get(single_field) is not None:
        return normalize_codes(data[single_field])
    return None


def _catalog_errors(db: Session, schedule_codes: List[str], reducer_codes: List[str]) -> List[str]:
    return (catalog_type_errors(db, reducer_codes, "reducer", "reducer_standard_codes")
            + catalog_type_errors(db, schedule_codes, "pipe_schedule", "schedule_standard_codes"))


def _prepare_sizes(db: Session, raw_sizes: List[Dict[str, Any]], schedule_codes: List[str]) -> tuple:
    """Stored size rows for the request rows, and the problems found. A row with dimensions but no
    catalog is matched to the class's catalogs (older clients); unmatched it must be marked custom."""
    catalogs = load_schedule_catalogs(db, schedule_codes)
    rows, errors = [], []
    for raw in raw_sizes:
        dn = int(raw.get("dn") or 0)
        if raw.get("custom"):
            if not raw.get("od_mm") or not raw.get("wt_mm"):
                errors.append(f"DN{dn}: a custom size needs an outside diameter and a wall thickness.")
                continue
            rows.append(custom_row(raw))
        elif raw.get("catalog"):
            rows.append(storage_row(raw))
        elif raw.get("od_mm") and raw.get("wt_mm"):
            match = match_catalog_size(dn, float(raw["od_mm"]), float(raw["wt_mm"]), raw.get("sch"), catalogs, schedule_codes)
            if not match:
                errors.append(f"DN{dn}: OD {raw['od_mm']} / WT {raw['wt_mm']} mm is not listed in the selected catalogs; mark the size as custom.")
                continue
            rows.append({"dn": dn, "catalog": match[0], "sch": match[1], "ca_mm": float(raw.get("ca_mm") or 0.0)})
        else:
            errors.append(f"DN{dn}: choose a catalog and schedule, or mark the size as custom.")
    return rows, errors + size_errors(rows, schedule_codes, catalogs)


def _temp_pressure_errors(points: List[Dict[str, Any]], min_temp: Optional[float], max_temp: Optional[float]) -> List[str]:
    """Checks the P-T curve and design temperature limits; `points` must be sorted by temperature."""
    errors = []
    temps = [p["temp_c"] for p in points]
    if len(set(temps)) != len(temps):
        errors.append("P-T ratings list the same temperature more than once.")
    if min_temp is not None and max_temp is not None and min_temp > max_temp:
        errors.append(f"Minimum design temperature ({min_temp} °C) is above the maximum ({max_temp} °C).")
    if temps:
        if min_temp is not None and min_temp < temps[0]:
            errors.append(f"Minimum design temperature ({min_temp} °C) is below the P-T curve ({temps[0]} °C).")
        if max_temp is not None and max_temp > temps[-1]:
            errors.append(f"Maximum design temperature ({max_temp} °C) is above the P-T curve ({temps[-1]} °C).")
    return errors


def _sorted_temp_pressures(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """P-T points as {temp_c, press_bar} floats, sorted by temperature."""
    return sorted(
        ({"temp_c": float(p["temp_c"]), "press_bar": float(p["press_bar"])} for p in points),
        key=lambda p: p["temp_c"]
    )


@router.post("", response_model=PipeClassResponse, status_code=status.HTTP_201_CREATED)
def create_pipe_class(
    payload: PipeClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_pipe_manager_user)
):
    """Create a new custom pipe class (Requires admin or pipe_manager role)."""
    data = payload.model_dump()
    schedule_codes = _codes_from(data, "schedule_standard_codes", "schedule_standard_code") or [DEFAULT_SCHEDULE_CATALOG]
    reducer_codes = _codes_from(data, "reducer_standard_codes", "reducer_standard_code") or [DEFAULT_REDUCER_CATALOG]
    ref_errors = _catalog_errors(db, schedule_codes, reducer_codes)
    if ref_errors:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="; ".join(ref_errors))

    existing = db.query(PipeClass).filter(PipeClass.code == payload.code.upper().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A pipe class with code '{payload.code}' already exists."
        )

    size_rows, spec_errors = _prepare_sizes(db, data["sizes"], schedule_codes)
    tp_dicts = _sorted_temp_pressures([tp.model_dump() for tp in (payload.temp_pressures or [])])
    spec_errors += _temp_pressure_errors(tp_dicts, payload.min_temp_c, payload.max_temp_c)
    if spec_errors:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="; ".join(spec_errors))

    new_class = PipeClass(
        code=payload.code.upper().strip(),
        name=payload.name.strip(),
        standard=payload.standard.upper().strip(),
        material_group=payload.material_group.strip(),
        material_grade=payload.material_grade.strip(),
        rating_class=payload.rating_class.strip(),
        design_code=payload.design_code.strip(),
        roughness_mm=payload.roughness_mm,
        corrosion_allowance_mm=payload.corrosion_allowance_mm,
        min_temp_c=payload.min_temp_c,
        max_temp_c=payload.max_temp_c,
        revision=payload.revision.strip(),
        rev_date=payload.rev_date,
        source_plant_id=payload.source_plant_id,
        is_builtin=False,
        sizes_json=json.dumps(size_rows),
        temp_pressures_json=json.dumps(tp_dicts),
    )
    _set_class_codes(new_class, schedule_codes, reducer_codes)

    db.add(new_class)
    db.commit()
    db.refresh(new_class)
    return _serialize_pipe_class(new_class)


@router.put("/{class_id}", response_model=PipeClassResponse)
def update_pipe_class(
    class_id: str,
    payload: PipeClassUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_pipe_manager_user)
):
    """Update a pipe class. The seeded example classes may be edited too; seed-examples restores missing ones."""
    item = db.query(PipeClass).filter(
        (PipeClass.id == class_id) | (PipeClass.code == class_id)
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipe class with identifier '{class_id}' not found."
        )

    update_data = payload.model_dump(exclude_unset=True)
    current_schedule, current_reducer = _class_codes(item)
    schedule_codes = _codes_from(update_data, "schedule_standard_codes", "schedule_standard_code") or current_schedule
    reducer_codes = _codes_from(update_data, "reducer_standard_codes", "reducer_standard_code") or current_reducer
    for field in ("schedule_standard_codes", "schedule_standard_code", "reducer_standard_codes", "reducer_standard_code"):
        update_data.pop(field, None)
    ref_errors = _catalog_errors(db, schedule_codes, reducer_codes)
    if ref_errors:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="; ".join(ref_errors))

    # Checked against the values the class will have after the update
    raw_sizes = update_data.pop("sizes", None)
    if raw_sizes is None:
        raw_sizes = _stored_sizes(item)
    size_rows, spec_errors = _prepare_sizes(db, raw_sizes, schedule_codes)
    tp_points = update_data.pop("temp_pressures", None)
    try:
        tp_dicts = _sorted_temp_pressures(tp_points if tp_points is not None else json.loads(item.temp_pressures_json or "[]"))
    except ValueError:
        tp_dicts = []
    spec_errors += _temp_pressure_errors(
        tp_dicts,
        update_data["min_temp_c"] if "min_temp_c" in update_data else item.min_temp_c,
        update_data["max_temp_c"] if "max_temp_c" in update_data else item.max_temp_c,
    )
    if spec_errors:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="; ".join(spec_errors))

    item.sizes_json = json.dumps(size_rows)
    item.temp_pressures_json = json.dumps(tp_dicts)
    _set_class_codes(item, schedule_codes, reducer_codes)
    for field, val in update_data.items():
        setattr(item, field, val)

    db.commit()
    db.refresh(item)
    return _serialize_pipe_class(item)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pipe_class(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_pipe_manager_user)
):
    """Delete a pipe class and remove it from the projects' allowed pipe classes."""
    item = db.query(PipeClass).filter(
        (PipeClass.id == class_id) | (PipeClass.code == class_id)
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipe class with identifier '{class_id}' not found."
        )

    # Allow-lists may hold the class id or (older entries) its code
    for project in db.query(Project).filter(Project.allowed_pipe_classes.isnot(None)).all():
        allowed = _parse_allowed_pipe_classes(project.allowed_pipe_classes)
        if allowed is None:
            continue
        remaining = [ref for ref in allowed if ref not in (item.id, item.code)]
        if len(remaining) != len(allowed):
            project.allowed_pipe_classes = json.dumps(remaining)

    db.delete(item)
    db.commit()
    return None



# --- Library Import / Export & Example Seeding ---

class PipeClassImportRequest(BaseModel):
    classes: List[Dict[str, Any]] = Field(..., description="Array of pipe class specifications to import")


@router.get("/export/library", response_model=List[Dict[str, Any]])
def export_pipe_classes_library(
    db: Session = Depends(get_db)
):
    """Export all pipe classes from local database as a structured JSON library."""
    classes = db.query(PipeClass).order_by(PipeClass.code.asc()).all()
    catalogs = load_schedule_catalogs(db)
    return [_serialize_pipe_class(c, catalogs) for c in classes]


@router.post("/import/library")
def import_pipe_classes_library(
    payload: PipeClassImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_pipe_manager_user)
):
    """
    Import an array of pipe classes into the catalog.
    Checks for duplicate specification codes (by code).
    Duplicates are NOT imported and reported back in skipped_duplicates.
    """
    imported = []
    skipped_duplicates = []
    invalid_entries = []

    for item_data in payload.classes:
        code = str(item_data.get("code") or "").upper().strip()
        if not code:
            invalid_entries.append({"reason": "Missing specification code", "item": item_data})
            continue

        existing = db.query(PipeClass).filter(PipeClass.code == code).first()
        if existing or code in imported:
            skipped_duplicates.append(code)
            continue

        try:
            raw_sizes = item_data.get("sizes") or []
            if not raw_sizes or not isinstance(raw_sizes, list):
                invalid_entries.append({"reason": f"Class '{code}' has no valid sizes array", "item": item_data})
                continue

            tp_dicts = _sorted_temp_pressures(item_data.get("temp_pressures") or [])
            min_temp = float(item_data["min_temp_c"]) if item_data.get("min_temp_c") is not None else None
            max_temp = float(item_data["max_temp_c"]) if item_data.get("max_temp_c") is not None else None

            # Older libraries carry dimensions only: matching catalog rows become references, others custom
            preferred = _codes_from(item_data, "schedule_standard_codes", "schedule_standard_code") or [DEFAULT_SCHEDULE_CATALOG]
            reducer_codes = _codes_from(item_data, "reducer_standard_codes", "reducer_standard_code") or [DEFAULT_REDUCER_CATALOG]
            ref_errors = _catalog_errors(db, preferred, reducer_codes)
            if not ref_errors:
                catalogs = load_schedule_catalogs(db)
                size_rows, used = reference_rows_from_dimensions(raw_sizes, catalogs, preferred)
                schedule_codes = preferred + [c for c in used if c not in preferred]
                ref_errors = (size_errors(size_rows, schedule_codes, catalogs)
                              + _temp_pressure_errors(tp_dicts, min_temp, max_temp))
            if ref_errors:
                invalid_entries.append({"reason": f"Class '{code}': " + "; ".join(ref_errors), "item": item_data})
                continue

            new_class = PipeClass(
                code=code,
                name=str(item_data.get("name") or f"Imported {code}").strip(),
                standard=str(item_data.get("standard") or "CUSTOM").upper().strip(),
                material_group=str(item_data.get("material_group") or "CS").strip(),
                material_grade=str(item_data.get("material_grade") or "Generic").strip(),
                rating_class=str(item_data.get("rating_class") or "CL150").strip(),
                design_code=str(item_data.get("design_code") or "ASME B31.3").strip(),
                roughness_mm=float(item_data.get("roughness_mm") or 0.045),
                corrosion_allowance_mm=float(item_data.get("corrosion_allowance_mm") or 0.0),
                min_temp_c=min_temp,
                max_temp_c=max_temp,
                revision=str(item_data.get("revision") or "1.0").strip(),
                rev_date=item_data.get("rev_date"),
                source_plant_id=item_data.get("source_plant_id"),
                is_builtin=False,
                sizes_json=json.dumps(size_rows),
                temp_pressures_json=json.dumps(tp_dicts)
            )
            _set_class_codes(new_class, schedule_codes, reducer_codes)
            db.add(new_class)
            imported.append(code)
        except (ValueError, TypeError, AttributeError) as e:
            invalid_entries.append({"reason": f"Class '{code}' has an unreadable value: {e}", "item": item_data})
            continue

    db.commit()
    return {
        "imported": imported,
        "skipped_duplicates": skipped_duplicates,
        "invalid_entries": invalid_entries,
        "imported_count": len(imported),
        "skipped_count": len(skipped_duplicates)
    }


@router.post("/seed-examples")
def seed_example_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_pipe_manager_user)
):
    """
    Restore Defaults: re-creates the example pipe classes (CS01, SS01, LT01, DX01) that are missing.
    """
    from services.pipe_class_defaults import EXAMPLE_PIPE_CLASSES, example_to_pipe_class

    created_count = 0
    created = []
    skipped = []

    for raw in EXAMPLE_PIPE_CLASSES:
        existing = db.query(PipeClass).filter(
            (PipeClass.code == raw["code"]) | (PipeClass.id == raw["id"])
        ).first()
        if existing:
            skipped.append(raw["code"])
            continue

        item = example_to_pipe_class(raw)
        db.add(item)
        created.append(raw["code"])
        created_count += 1

    db.commit()
    return {
        "created_count": created_count,
        "created": created,
        "skipped": skipped,
        "message": f"Created {created_count} example pipe classes ({len(skipped)} already existed)."
    }



