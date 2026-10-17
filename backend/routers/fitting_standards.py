"""
Fitting Standards Catalog REST API Endpoints

Provides CRUD operations, cloning, importing, exporting, and default seeding
for standardized piping fittings (e.g., ASME B16.9 Reducers, ASME B36.10M Pipe Schedules).
"""

from typing import List, Optional, Dict, Any
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import or_

from db.database import get_db
from db.models import FittingStandard, PipeClass, User
from auth import get_current_user, get_current_pipe_manager_user
from services.pipe_class_catalog import normalize_codes, references_to

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/fitting-standards",
    tags=["Fitting Standards"]
)


# --- Validation ---

ALLOWED_FITTING_TYPES = {"reducer", "pipe_schedule", "elbow", "tee"}
MAX_CODE_LENGTH = 50
MAX_IMPORT_STANDARDS = 200
MAX_DIMENSION_RECORDS = 5000


def _validate_dimensions(fitting_type: str, dimensions: Any) -> List[str]:
    """Returns human-readable problems with a dimensions array (empty list when valid)."""
    if not isinstance(dimensions, list):
        return ["'dimensions' must be a list."]
    if len(dimensions) > MAX_DIMENSION_RECORDS:
        return [f"'dimensions' exceeds {MAX_DIMENSION_RECORDS} records."]

    errors = []
    for i, rec in enumerate(dimensions):
        if not isinstance(rec, dict):
            errors.append(f"dimensions[{i}] must be an object.")
        elif fitting_type == "reducer":
            try:
                dn_l = float(rec["dn_large"])
                dn_s = float(rec["dn_small"])
                length = float(rec["length_mm"])
            except (KeyError, TypeError, ValueError):
                errors.append(f"dimensions[{i}] needs numeric dn_large, dn_small and length_mm.")
                continue
            if dn_l <= dn_s:
                errors.append(f"dimensions[{i}]: dn_large ({dn_l:g}) must exceed dn_small ({dn_s:g}).")
            if length <= 0:
                errors.append(f"dimensions[{i}]: length_mm must be positive.")
        if len(errors) >= 10:
            errors.append("further errors omitted")
            break
    return errors


def _validate_standard_fields(code: Optional[str], fitting_type: Optional[str], dimensions: Any) -> List[str]:
    errors = []
    if code is not None and not (1 <= len(code) <= MAX_CODE_LENGTH):
        errors.append(f"'code' must be 1-{MAX_CODE_LENGTH} characters.")
    if fitting_type is not None and fitting_type not in ALLOWED_FITTING_TYPES:
        errors.append(f"'fitting_type' must be one of {sorted(ALLOWED_FITTING_TYPES)}.")
    if dimensions is not None:
        errors.extend(_validate_dimensions(fitting_type or "", dimensions))
    return errors


def _raise_if_invalid(errors: List[str]):
    if errors:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="; ".join(errors))


def _find_standard(db: Session, id_or_code: str) -> Optional[FittingStandard]:
    """Looks up by UUID or by code (codes are stored upper-case)."""
    return db.query(FittingStandard).filter(
        or_(FittingStandard.id == id_or_code, FittingStandard.code == id_or_code.strip().upper())
    ).first()


def _referencing_pipe_classes(db: Session, code: str) -> List[str]:
    """Codes of the pipe classes that select catalog `code`."""
    referencing = []
    for pc in db.query(PipeClass).all():
        if code in normalize_codes(pc.schedule_standard_codes or pc.schedule_standard_code)                 or code in normalize_codes(pc.reducer_standard_codes or pc.reducer_standard_code):
            referencing.append(pc.code)
    return sorted(referencing)


def _dropped_references(db: Session, item: FittingStandard, new_type: str, new_dimensions: Any) -> List[str]:
    """Problems when new data for catalog `item` would remove what pipe classes use: its fitting type,
    or a DN / schedule a class size row references. Changed values are fine; they reach the classes."""
    users = _referencing_pipe_classes(db, item.code)
    if not users:
        return []
    if new_type != item.fitting_type:
        return [f"'{item.code}' is used by pipe classes {', '.join(users)}; its fitting type cannot change."]
    if new_dimensions is None or new_type != "pipe_schedule":
        return []
    listed = {
        (int(r.get("dn") or 0), k.upper())
        for r in new_dimensions if isinstance(r, dict)
        for k in (r.get("schedules") or {})
    }
    errors = []
    for pc in db.query(PipeClass).filter(PipeClass.code.in_(users)).all():
        try:
            rows = json.loads(pc.sizes_json or "[]")
        except ValueError:
            continue
        missing = [f"DN{dn} {sch}" for dn, sch in references_to(rows, item.code) if (dn, sch.upper()) not in listed]
        if missing:
            errors.append(f"pipe class {pc.code} uses {', '.join(missing)} from '{item.code}'")
    if errors:
        return ["Sizes in use cannot be removed: " + "; ".join(errors) + "."]
    return []


# --- Pydantic Schemas ---

class FittingStandardCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50, description="Unique fitting standard code")
    name: str = Field(..., min_length=1, max_length=150, description="Descriptive name")
    standard: str = Field("ASME", max_length=50, description="Governing standard (ASME, DIN_EN, ISO, CUSTOM)")
    fitting_type: str = Field(..., max_length=50, description="Fitting category (reducer, pipe_schedule, elbow, tee)")
    subtype: Optional[str] = Field(None, max_length=50, description="Specific sub-variant")
    description: Optional[str] = Field(None, description="Detailed engineering notes")
    dimensions: List[Dict[str, Any]] = Field(default_factory=list, description="Array of dimensional records")


class FittingStandardUpdate(BaseModel):
    name: Optional[str] = None
    standard: Optional[str] = None
    fitting_type: Optional[str] = None
    subtype: Optional[str] = None
    description: Optional[str] = None
    dimensions: Optional[List[Dict[str, Any]]] = None


class FittingStandardClone(BaseModel):
    new_code: str = Field(..., min_length=1, max_length=50, description="New unique code for cloned standard")
    new_name: Optional[str] = Field(None, description="Optional new name")


class FittingStandardResponse(BaseModel):
    id: str
    code: str
    name: str
    standard: str
    fitting_type: str
    subtype: Optional[str] = None
    description: Optional[str] = None
    is_builtin: bool
    dimensions: List[Dict[str, Any]]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


def _serialize_fitting_standard(item: FittingStandard) -> Dict[str, Any]:
    """Helper to convert FittingStandard ORM model to dictionary with parsed dimensions."""
    try:
        dimensions = json.loads(item.dimensions_json) if item.dimensions_json else []
    except Exception:
        dimensions = []

    return {
        "id": item.id,
        "code": item.code,
        "name": item.name,
        "standard": item.standard,
        "fitting_type": item.fitting_type,
        "subtype": item.subtype,
        "description": item.description,
        "is_builtin": item.is_builtin,
        "dimensions": dimensions,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


# --- Static Endpoints (must come before dynamic /{id_or_code}) ---

@router.get("", response_model=List[FittingStandardResponse])
def list_fitting_standards(
    fitting_type: Optional[str] = Query(None, description="Filter by fitting type: reducer, pipe_schedule, elbow, tee"),
    standard: Optional[str] = Query(None, description="Filter by standard: ASME, DIN_EN, ISO, CUSTOM"),
    q: Optional[str] = Query(None, description="Search term across code, name, and description"),
    db: Session = Depends(get_db)
):
    """List all fitting standards with optional filtering and search."""
    query = db.query(FittingStandard)

    if fitting_type and fitting_type.upper() != "ALL":
        query = query.filter(FittingStandard.fitting_type == fitting_type.lower())

    if standard and standard.upper() != "ALL":
        query = query.filter(FittingStandard.standard == standard.upper())

    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                FittingStandard.code.ilike(term),
                FittingStandard.name.ilike(term),
                FittingStandard.description.ilike(term)
            )
        )

    standards = query.order_by(FittingStandard.is_builtin.desc(), FittingStandard.code.asc()).all()
    return [_serialize_fitting_standard(s) for s in standards]


@router.get("/export-library", response_model=List[Dict[str, Any]])
def export_fitting_standards_library(
    db: Session = Depends(get_db)
):
    """Export all fitting standards as a portable JSON catalog."""
    standards = db.query(FittingStandard).all()
    return [_serialize_fitting_standard(s) for s in standards]


@router.post("/import-library", response_model=Dict[str, Any])
def import_fitting_standards_library(
    payload: List[Dict[str, Any]],
    current_user: User = Depends(get_current_pipe_manager_user),
    db: Session = Depends(get_db)
):
    """Import a JSON library of fitting standards with conflict handling.

    The payload is validated up front; any invalid entry rejects the whole import.
    """
    if len(payload) > MAX_IMPORT_STANDARDS:
        _raise_if_invalid([f"Import is limited to {MAX_IMPORT_STANDARDS} standards per file."])

    errors = []
    for idx, item in enumerate(payload):
        code = str(item.get("code") or "").strip().upper()
        fitting_type = str(item.get("fitting_type") or "reducer").strip().lower()
        for err in _validate_standard_fields(code, fitting_type, item.get("dimensions", [])):
            errors.append(f"Entry {idx} ({code or 'no code'}): {err}")
        existing = db.query(FittingStandard).filter(FittingStandard.code == code).first() if code else None
        if existing and not existing.is_builtin:
            for err in _dropped_references(db, existing, fitting_type, item.get("dimensions", [])):
                errors.append(f"Entry {idx} ({code}): {err}")
    _raise_if_invalid(errors[:20])

    imported_count = 0
    skipped_count = 0
    updated_count = 0
    added_codes = set()   # autoflush is off, so a repeated code in one payload is not visible to the query

    for item in payload:
        code = str(item.get("code")).strip().upper()
        fitting_type = str(item.get("fitting_type") or "reducer").strip().lower()

        if code in added_codes:
            skipped_count += 1
            continue

        existing = db.query(FittingStandard).filter(FittingStandard.code == code).first()
        dim_json = json.dumps(item.get("dimensions", []))

        if existing:
            if not existing.is_builtin:
                existing.name = item.get("name", existing.name)
                existing.standard = item.get("standard", existing.standard)
                existing.fitting_type = fitting_type
                existing.subtype = item.get("subtype", existing.subtype)
                existing.description = item.get("description", existing.description)
                existing.dimensions_json = dim_json
                updated_count += 1
            else:
                skipped_count += 1
        else:
            new_obj = FittingStandard(
                code=code,
                name=item.get("name", code),
                standard=item.get("standard", "CUSTOM"),
                fitting_type=fitting_type,
                subtype=item.get("subtype"),
                description=item.get("description"),
                is_builtin=False,
                dimensions_json=dim_json
            )
            db.add(new_obj)
            added_codes.add(code)
            imported_count += 1

    db.commit()
    return {
        "status": "success",
        "imported": imported_count,
        "updated": updated_count,
        "skipped": skipped_count
    }


@router.post("/seed-defaults", response_model=Dict[str, Any])
def reseed_fitting_defaults(
    restore_builtins: bool = Query(False, description="Also reset edited built-in standards to factory data (admin only)"),
    current_user: User = Depends(get_current_pipe_manager_user),
    db: Session = Depends(get_db)
):
    """Re-seeds missing built-in fitting standards. With restore_builtins, admins can also
    revert edited built-in standards to their factory dimensions."""
    from services.fitting_defaults import EXAMPLE_FITTING_STANDARDS

    if restore_builtins and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can restore built-in standards."
        )

    seeded_count = 0
    restored_count = 0
    if restore_builtins:
        in_use = []
        for ex in EXAMPLE_FITTING_STANDARDS:
            existing = db.query(FittingStandard).filter(FittingStandard.code == ex["code"]).first()
            if existing and existing.is_builtin:
                in_use += _dropped_references(db, existing, ex["fitting_type"], ex["dimensions"])
        if in_use:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="; ".join(in_use))
    for ex in EXAMPLE_FITTING_STANDARDS:
        existing = db.query(FittingStandard).filter(FittingStandard.code == ex["code"]).first()
        if existing and existing.is_builtin and restore_builtins:
            existing.name = ex["name"]
            existing.standard = ex["standard"]
            existing.fitting_type = ex["fitting_type"]
            existing.subtype = ex.get("subtype")
            existing.description = ex.get("description")
            existing.dimensions_json = json.dumps(ex["dimensions"])
            restored_count += 1
        elif not existing:
            standard = FittingStandard(
                id=ex["id"],
                code=ex["code"],
                name=ex["name"],
                standard=ex["standard"],
                fitting_type=ex["fitting_type"],
                subtype=ex.get("subtype"),
                description=ex.get("description"),
                is_builtin=ex.get("is_builtin", False),
                dimensions_json=json.dumps(ex["dimensions"]),
            )
            db.add(standard)
            seeded_count += 1
    db.commit()
    return {"status": "success", "seeded_count": seeded_count, "restored_count": restored_count}


@router.post("", response_model=FittingStandardResponse, status_code=status.HTTP_201_CREATED)
def create_fitting_standard(
    payload: FittingStandardCreate,
    current_user: User = Depends(get_current_pipe_manager_user),
    db: Session = Depends(get_db)
):
    """Create a new custom fitting standard (Admin or Pipe Manager)."""
    code_clean = payload.code.strip().upper()
    fitting_type_clean = payload.fitting_type.strip().lower()
    _raise_if_invalid(_validate_standard_fields(code_clean, fitting_type_clean, payload.dimensions))
    existing = db.query(FittingStandard).filter(FittingStandard.code == code_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fitting standard with code '{code_clean}' already exists."
        )

    new_standard = FittingStandard(
        code=code_clean,
        name=payload.name.strip(),
        standard=payload.standard.strip().upper() if payload.standard else "CUSTOM",
        fitting_type=fitting_type_clean,
        subtype=payload.subtype.strip().lower() if payload.subtype else None,
        description=payload.description.strip() if payload.description else None,
        is_builtin=False,
        dimensions_json=json.dumps(payload.dimensions)
    )
    db.add(new_standard)
    db.commit()
    db.refresh(new_standard)

    return _serialize_fitting_standard(new_standard)


# --- Dynamic Single-Item Endpoints ---

@router.get("/{id_or_code}", response_model=FittingStandardResponse)
def get_fitting_standard(
    id_or_code: str,
    db: Session = Depends(get_db)
):
    """Retrieve a single fitting standard by UUID or unique code."""
    item = _find_standard(db, id_or_code)

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fitting standard '{id_or_code}' not found."
        )

    return _serialize_fitting_standard(item)


@router.post("/{id_or_code}/clone", response_model=FittingStandardResponse, status_code=status.HTTP_201_CREATED)
def clone_fitting_standard(
    id_or_code: str,
    payload: FittingStandardClone,
    current_user: User = Depends(get_current_pipe_manager_user),
    db: Session = Depends(get_db)
):
    """Clone an existing fitting standard into an editable custom standard."""
    source = _find_standard(db, id_or_code)

    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source fitting standard '{id_or_code}' not found."
        )

    new_code = payload.new_code.strip().upper()
    if db.query(FittingStandard).filter(FittingStandard.code == new_code).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fitting standard with code '{new_code}' already exists."
        )

    cloned = FittingStandard(
        code=new_code,
        name=payload.new_name.strip() if payload.new_name else f"{source.name} (Custom Copy)",
        standard="CUSTOM",
        fitting_type=source.fitting_type,
        subtype=source.subtype,
        description=f"Cloned from {source.code}. {source.description or ''}".strip(),
        is_builtin=False,
        dimensions_json=source.dimensions_json
    )
    db.add(cloned)
    db.commit()
    db.refresh(cloned)

    return _serialize_fitting_standard(cloned)


@router.put("/{id_or_code}", response_model=FittingStandardResponse)
def update_fitting_standard(
    id_or_code: str,
    payload: FittingStandardUpdate,
    current_user: User = Depends(get_current_pipe_manager_user),
    db: Session = Depends(get_db)
):
    """Update a custom fitting standard. Built-in standards cannot be modified directly."""
    item = _find_standard(db, id_or_code)

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fitting standard '{id_or_code}' not found."
        )

    if item.is_builtin and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Built-in standards cannot be modified. Please clone to a custom standard instead."
        )

    new_type = payload.fitting_type.strip().lower() if payload.fitting_type is not None else item.fitting_type
    _raise_if_invalid(_validate_standard_fields(None, new_type, payload.dimensions))
    in_use = _dropped_references(db, item, new_type, payload.dimensions)
    if in_use:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="; ".join(in_use))

    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.standard is not None:
        item.standard = payload.standard.strip().upper()
    if payload.fitting_type is not None:
        item.fitting_type = new_type
    if payload.subtype is not None:
        item.subtype = payload.subtype.strip().lower()
    if payload.description is not None:
        item.description = payload.description.strip()
    if payload.dimensions is not None:
        item.dimensions_json = json.dumps(payload.dimensions)

    db.commit()
    db.refresh(item)
    return _serialize_fitting_standard(item)


@router.delete("/{id_or_code}")
def delete_fitting_standard(
    id_or_code: str,
    current_user: User = Depends(get_current_pipe_manager_user),
    db: Session = Depends(get_db)
):
    """Delete a custom fitting standard. Built-in standards cannot be deleted."""
    item = _find_standard(db, id_or_code)

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fitting standard '{id_or_code}' not found."
        )

    if item.is_builtin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Built-in system standards cannot be deleted."
        )

    referenced_by = _referencing_pipe_classes(db, item.code)
    if referenced_by:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Fitting standard '{item.code}' is referenced by pipe classes: {', '.join(referenced_by)}. Reassign them first."
        )

    db.delete(item)
    db.commit()
    return {"status": "success", "message": f"Fitting standard '{item.code}' successfully deleted."}
