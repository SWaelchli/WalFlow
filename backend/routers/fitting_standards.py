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
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_

from db.database import get_db
from db.models import FittingStandard, User
from auth import get_current_user, get_current_pipe_manager_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/fitting-standards",
    tags=["Fitting Standards"]
)


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

    class Config:
        from_attributes = True


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
    """Import a JSON library of fitting standards with conflict handling."""
    imported_count = 0
    skipped_count = 0
    updated_count = 0

    for item in payload:
        code = str(item.get("code", "")).strip().upper()
        if not code:
            skipped_count += 1
            continue

        existing = db.query(FittingStandard).filter(FittingStandard.code == code).first()
        dimensions = item.get("dimensions", [])
        dim_json = json.dumps(dimensions) if isinstance(dimensions, list) else json.dumps([])

        if existing:
            if not existing.is_builtin:
                existing.name = item.get("name", existing.name)
                existing.standard = item.get("standard", existing.standard)
                existing.fitting_type = item.get("fitting_type", existing.fitting_type)
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
                fitting_type=item.get("fitting_type", "reducer"),
                subtype=item.get("subtype"),
                description=item.get("description"),
                is_builtin=False,
                dimensions_json=dim_json
            )
            db.add(new_obj)
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
    current_user: User = Depends(get_current_pipe_manager_user),
    db: Session = Depends(get_db)
):
    """Admin/Manager endpoint to re-seed default built-in fitting standards if missing."""
    from services.fitting_defaults import EXAMPLE_FITTING_STANDARDS

    seeded_count = 0
    for ex in EXAMPLE_FITTING_STANDARDS:
        existing = db.query(FittingStandard).filter(FittingStandard.code == ex["code"]).first()
        if not existing:
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
    return {"status": "success", "seeded_count": seeded_count}


@router.post("", response_model=FittingStandardResponse, status_code=status.HTTP_201_CREATED)
def create_fitting_standard(
    payload: FittingStandardCreate,
    current_user: User = Depends(get_current_pipe_manager_user),
    db: Session = Depends(get_db)
):
    """Create a new custom fitting standard (Admin or Pipe Manager)."""
    code_clean = payload.code.strip().upper()
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
        fitting_type=payload.fitting_type.strip().lower(),
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
    item = db.query(FittingStandard).filter(
        or_(FittingStandard.id == id_or_code, FittingStandard.code == id_or_code)
    ).first()

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
    source = db.query(FittingStandard).filter(
        or_(FittingStandard.id == id_or_code, FittingStandard.code == id_or_code)
    ).first()

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
    item = db.query(FittingStandard).filter(
        or_(FittingStandard.id == id_or_code, FittingStandard.code == id_or_code)
    ).first()

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

    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.standard is not None:
        item.standard = payload.standard.strip().upper()
    if payload.fitting_type is not None:
        item.fitting_type = payload.fitting_type.strip().lower()
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
    item = db.query(FittingStandard).filter(
        or_(FittingStandard.id == id_or_code, FittingStandard.code == id_or_code)
    ).first()

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

    db.delete(item)
    db.commit()
    return {"status": "success", "message": f"Fitting standard '{item.code}' successfully deleted."}
