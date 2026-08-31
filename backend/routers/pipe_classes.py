import json
import logging
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import PipeClass, User
from auth import get_current_user, get_current_pipe_manager_user

router = APIRouter(prefix="/api/pipe-classes", tags=["pipe-classes"])


# --- Pydantic Schemas ---

class PipeSizeEntry(BaseModel):
    dn: int = Field(..., description="Nominal diameter in mm")
    nps: str = Field(..., description="Nominal pipe size in inches (e.g. 2, 1/2)")
    od_mm: float = Field(..., gt=0, description="Outer diameter in mm")
    wt_mm: float = Field(..., gt=0, description="Wall thickness in mm")
    id_mm: Optional[float] = Field(None, description="Calculated internal diameter in mm (OD - 2*WT)")
    sch: Optional[str] = Field("STD", description="Schedule designation (e.g. STD, 40, 80, 10S)")
    ca_mm: Optional[float] = Field(0.0, ge=0, description="Size-specific corrosion allowance in mm")



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
    reducer_standard_code: Optional[str] = Field("ASME_B16_9_REDUCERS", description="Code of referenced Reducer fitting standard")
    schedule_standard_code: Optional[str] = Field("ASME_B36_10M_SCHEDULES", description="Code of referenced Pipe Schedule standard")
    roughness_mm: float = Field(0.045, gt=0, description="Absolute surface roughness in mm")
    corrosion_allowance_mm: float = Field(0.0, ge=0, description="Base corrosion allowance in mm")
    min_temp_c: Optional[float] = Field(None, description="Minimum allowable design temperature in °C")
    max_temp_c: Optional[float] = Field(None, description="Maximum allowable design temperature in °C")
    revision: str = Field("1.0", description="Specification revision")
    rev_date: Optional[str] = Field(None, description="Specification revision date")
    source_plant_id: Optional[int] = Field(None, description="Equinor TR2000 plant ID if synced")
    sizes: List[PipeSizeEntry] = Field(..., min_items=1, description="Array of supported nominal sizes")
    temp_pressures: Optional[List[TempPressureEntry]] = Field(default_factory=list, description="P-T rating points")


class PipeClassUpdate(BaseModel):
    name: Optional[str] = None
    material_group: Optional[str] = None
    material_grade: Optional[str] = None
    rating_class: Optional[str] = None
    design_code: Optional[str] = None
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
    reducer_standard_code: Optional[str] = "ASME_B16_9_REDUCERS"
    schedule_standard_code: Optional[str] = "ASME_B36_10M_SCHEDULES"
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

    class Config:
        from_attributes = True


def _serialize_pipe_class(item: PipeClass) -> Dict[str, Any]:
    """Helper to convert PipeClass ORM model to dictionary with parsed JSON blobs."""
    try:
        sizes = json.loads(item.sizes_json) if item.sizes_json else []
    except Exception:
        sizes = []
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
        "reducer_standard_code": getattr(item, 'reducer_standard_code', 'ASME_B16_9_REDUCERS') or 'ASME_B16_9_REDUCERS',
        "schedule_standard_code": getattr(item, 'schedule_standard_code', 'ASME_B36_10M_SCHEDULES') or 'ASME_B36_10M_SCHEDULES',
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
            detail=f"Failed to communicate with Equinor TR2000 REST API: {str(err)}"
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
            detail=f"Failed to fetch TR2000 PCS specifications: {str(err)}"
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
                "and maintain TR2000 piping specifications in WalFlow."
            )
        )

    try:
        normalized = await fetch_and_normalize_tr2000_pcs(
            plant_id=payload.plant_id,
            pcs_code=payload.pcs_code,
            rev_id=payload.rev_id
        )
    except Exception as err:
        logging.error(f"TR2000 sync error for {payload.pcs_code}: {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to retrieve specification '{payload.pcs_code}' from TR2000 API: {str(err)}"
        )

    from db.database import SessionLocal
    db = SessionLocal()
    try:
        target_code = payload.custom_code.upper().strip() if payload.custom_code else normalized["code"]
        
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
            existing.reducer_standard_code = normalized.get("reducer_standard_code", "ASME_B16_9_REDUCERS")
            existing.schedule_standard_code = normalized.get("schedule_standard_code", "ASME_B36_10M_SCHEDULES")
            existing.roughness_mm = normalized["roughness_mm"]
            existing.corrosion_allowance_mm = normalized["corrosion_allowance_mm"]
            existing.min_temp_c = normalized["min_temp_c"]
            existing.max_temp_c = normalized["max_temp_c"]
            existing.revision = normalized["revision"]
            existing.source_plant_id = normalized["source_plant_id"]
            existing.sizes_json = json.dumps(normalized["sizes"])
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
                reducer_standard_code=normalized.get("reducer_standard_code", "ASME_B16_9_REDUCERS"),
                schedule_standard_code=normalized.get("schedule_standard_code", "ASME_B36_10M_SCHEDULES"),
                roughness_mm=normalized["roughness_mm"],
                corrosion_allowance_mm=normalized["corrosion_allowance_mm"],
                min_temp_c=normalized["min_temp_c"],
                max_temp_c=normalized["max_temp_c"],
                revision=normalized["revision"],
                source_plant_id=normalized["source_plant_id"],
                is_builtin=False,
                sizes_json=json.dumps(normalized["sizes"]),
                temp_pressures_json=json.dumps(normalized["temp_pressures"])
            )
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
    return [_serialize_pipe_class(c) for c in classes]


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


@router.post("", response_model=PipeClassResponse, status_code=status.HTTP_201_CREATED)
def create_pipe_class(
    payload: PipeClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_pipe_manager_user)
):
    """Create a new custom pipe class (Requires admin or pipe_manager role)."""
    existing = db.query(PipeClass).filter(PipeClass.code == payload.code.upper().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A pipe class with code '{payload.code}' already exists."
        )

    # Validate calculated IDs
    size_dicts = []
    for s in payload.sizes:
        calculated_id = round(s.od_mm - 2 * s.wt_mm, 3)
        if calculated_id <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid pipe dimensions for DN{s.dn}: OD ({s.od_mm}mm) must be greater than 2 * WT ({2 * s.wt_mm}mm)."
            )
        entry = s.model_dump()
        entry["id_mm"] = calculated_id
        size_dicts.append(entry)

    tp_dicts = [tp.model_dump() for tp in (payload.temp_pressures or [])]

    new_class = PipeClass(
        code=payload.code.upper().strip(),
        name=payload.name.strip(),
        standard=payload.standard.upper().strip(),
        material_group=payload.material_group.strip(),
        material_grade=payload.material_grade.strip(),
        rating_class=payload.rating_class.strip(),
        design_code=payload.design_code.strip(),
        reducer_standard_code=payload.reducer_standard_code or "ASME_B16_9_REDUCERS",
        schedule_standard_code=payload.schedule_standard_code or "ASME_B36_10M_SCHEDULES",
        roughness_mm=payload.roughness_mm,
        corrosion_allowance_mm=payload.corrosion_allowance_mm,
        min_temp_c=payload.min_temp_c,
        max_temp_c=payload.max_temp_c,
        revision=payload.revision.strip(),
        rev_date=payload.rev_date,
        source_plant_id=payload.source_plant_id,
        is_builtin=False,
        sizes_json=json.dumps(size_dicts),
        temp_pressures_json=json.dumps(tp_dicts),
    )


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
    """Update a custom pipe class (Built-in standard example classes cannot be modified)."""
    item = db.query(PipeClass).filter(
        (PipeClass.id == class_id) | (PipeClass.code == class_id)
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipe class with identifier '{class_id}' not found."
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "sizes" in update_data and update_data["sizes"] is not None:
        size_dicts = []
        for s in update_data["sizes"]:
            od = s.get("od_mm", 0)
            wt = s.get("wt_mm", 0)
            calc_id = round(od - 2 * wt, 3)
            if calc_id <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid pipe dimensions: OD ({od}mm) must be greater than 2 * WT ({2 * wt}mm)."
                )
            s["id_mm"] = calc_id
            size_dicts.append(s)
        item.sizes_json = json.dumps(size_dicts)
        del update_data["sizes"]

    if "temp_pressures" in update_data and update_data["temp_pressures"] is not None:
        item.temp_pressures_json = json.dumps(update_data["temp_pressures"])
        del update_data["temp_pressures"]

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
    """Delete a pipe class."""
    item = db.query(PipeClass).filter(
        (PipeClass.id == class_id) | (PipeClass.code == class_id)
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipe class with identifier '{class_id}' not found."
        )

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
    return [_serialize_pipe_class(c) for c in classes]


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
        code = (item_data.get("code") or "").upper().strip()
        if not code:
            invalid_entries.append({"reason": "Missing specification code", "item": item_data})
            continue

        existing = db.query(PipeClass).filter(PipeClass.code == code).first()
        if existing:
            skipped_duplicates.append(code)
            continue

        raw_sizes = item_data.get("sizes") or []
        if not raw_sizes or not isinstance(raw_sizes, list):
            invalid_entries.append({"reason": f"Class '{code}' has no valid sizes array", "item": item_data})
            continue

        normalized_sizes = []
        valid_sizes = True
        for s in raw_sizes:
            od = float(s.get("od_mm") or 0.0)
            wt = float(s.get("wt_mm") or 0.0)
            calc_id = round(od - 2.0 * wt, 3)
            if calc_id <= 0:
                valid_sizes = False
                break
            normalized_sizes.append({
                "dn": int(s.get("dn") or 0),
                "nps": str(s.get("nps") or ""),
                "od_mm": od,
                "wt_mm": wt,
                "id_mm": calc_id,
                "sch": str(s.get("sch") or "STD"),
                "ca_mm": float(s.get("ca_mm") or 0.0)
            })

        if not valid_sizes:
            invalid_entries.append({"reason": f"Class '{code}' has invalid size dimensions (OD <= 2*WT)", "item": item_data})
            continue

        raw_tp = item_data.get("temp_pressures") or []

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
            min_temp_c=float(item_data["min_temp_c"]) if item_data.get("min_temp_c") is not None else None,
            max_temp_c=float(item_data["max_temp_c"]) if item_data.get("max_temp_c") is not None else None,
            revision=str(item_data.get("revision") or "1.0").strip(),
            rev_date=item_data.get("rev_date"),
            source_plant_id=item_data.get("source_plant_id"),
            is_builtin=False,
            sizes_json=json.dumps(normalized_sizes),
            temp_pressures_json=json.dumps(raw_tp)
        )
        db.add(new_class)
        imported.append(code)

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
    Seed the 4 standard example pipe classes (CS01, SS01, LT01, DX01) if not already present.
    """
    from services.pipe_class_defaults import EXAMPLE_PIPE_CLASSES

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

        item = PipeClass(
            id=raw["id"],
            code=raw["code"],
            name=raw["name"],
            standard=raw["standard"],
            material_group=raw["material_group"],
            material_grade=raw["material_grade"],
            rating_class=raw["rating_class"],
            design_code=raw["design_code"],
            roughness_mm=raw["roughness_mm"],
            corrosion_allowance_mm=raw["corrosion_allowance_mm"],
            min_temp_c=raw.get("min_temp_c"),
            max_temp_c=raw.get("max_temp_c"),
            revision=raw.get("revision", "1.0"),
            rev_date=raw.get("rev_date"),
            source_plant_id=raw.get("source_plant_id"),
            is_builtin=False,
            sizes_json=json.dumps(raw["sizes"]),
            temp_pressures_json=json.dumps(raw.get("temp_pressures", []))
        )
        db.add(item)
        created.append(raw["code"])
        created_count += 1

    db.commit()
    return {
        "created_count": created_count,
        "created": created,
        "skipped": skipped,
        "message": f"Created {created_count} example specifications ({len(skipped)} already existed)."
    }



