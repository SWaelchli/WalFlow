import os
import json
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    import redis
except ImportError:
    redis = None

from db.database import get_db
from db.models import User, Diagram, ProjectMember, Project
from auth import get_current_user
from routers.projects import get_user_project_role
from services.lock_service import (
    ConnectionManager,
    collab_manager,
    acquire_lock,
    release_lock,
    get_lock_status_info,
    LOCAL_LOCKS,
)

router = APIRouter(prefix="/api/diagrams", tags=["diagrams"])


class DiagramCreateSchema(BaseModel):
    title: str = "Untitled Diagram"
    description: Optional[str] = ""
    diagram_data: str  # JSON stringified nodes, edges, globalSettings
    project_id: Optional[str] = None

class DiagramUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    diagram_data: Optional[str] = None

class DiagramSummarySchema(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str]
    title: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    lock_info: Optional[dict] = None

    class Config:
        from_attributes = True

class DiagramDetailSchema(DiagramSummarySchema):
    diagram_data: str

@router.get("", response_model=List[DiagramSummarySchema])
def list_user_diagrams(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if project_id:
        role = get_user_project_role(db, project_id, current_user.id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this project's diagrams."
            )
        diagrams = db.query(Diagram).filter(Diagram.project_id == project_id).order_by(Diagram.updated_at.desc()).all()
    else:
        # Standalone diagrams owned directly by user
        diagrams = db.query(Diagram).filter(
            Diagram.user_id == current_user.id,
            Diagram.project_id.is_(None)
        ).order_by(Diagram.updated_at.desc()).all()
    
    for d in diagrams:
        d.lock_info = get_lock_status_info(d.id)
    return diagrams

@router.get("/{diagram_id}", response_model=DiagramDetailSchema)
def get_diagram_detail(
    diagram_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    if diagram.project_id:
        role = get_user_project_role(db, diagram.project_id, current_user.id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this diagram's project."
            )
    else:
        if diagram.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this standalone diagram."
            )
            
    diagram.lock_info = get_lock_status_info(diagram.id)
    return diagram

@router.post("", response_model=DiagramDetailSchema, status_code=status.HTTP_201_CREATED)
def create_diagram(
    payload: DiagramCreateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if payload.project_id:
        role = get_user_project_role(db, payload.project_id, current_user.id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot add diagrams to a project you don't belong to."
            )

    new_diagram = Diagram(
        user_id=current_user.id,
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description or "",
        diagram_data=payload.diagram_data
    )
    db.add(new_diagram)
    db.commit()
    db.refresh(new_diagram)
    return new_diagram

@router.put("/{diagram_id}", response_model=DiagramDetailSchema)
async def update_diagram(
    diagram_id: str,
    payload: DiagramUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    if diagram.project_id:
        role = get_user_project_role(db, diagram.project_id, current_user.id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this project."
            )
        
        # Lock lease enforcement
        lock = get_lock_status_info(diagram.id)
        if lock and lock["user_id"] != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot save: Diagram is currently locked by {lock['username']}."
            )
        
        # Extend current lock lease on save
        acquire_lock(diagram.id, current_user.id, current_user.username)
    else:
        # Standalone diagram
        if diagram.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this diagram."
            )

    if payload.title is not None:
        diagram.title = payload.title
    if payload.description is not None:
        diagram.description = payload.description
    if payload.diagram_data is not None:
        diagram.diagram_data = payload.diagram_data
    
    diagram.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(diagram)

    # Broadcast update event to other co-editors
    await collab_manager.broadcast_to_diagram(
        diagram_id,
        {
            "action": "diagram_updated",
            "diagram_id": diagram_id,
            "user_id": current_user.id,
            "username": current_user.username
        }
    )

    return diagram

@router.delete("/{diagram_id}", status_code=status.HTTP_200_OK)
async def delete_diagram(
    diagram_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    if diagram.project_id:
        role = get_user_project_role(db, diagram.project_id, current_user.id)
        # Only project owners or diagram creator can delete it
        if role != "owner" and diagram.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only project owners or the diagram creator can delete it."
            )
        # Release lock if deleted
        release_lock(diagram.id, current_user.id, force=True)
        # Broadcast lock release
        await collab_manager.broadcast_to_diagram(
            diagram_id,
            {
                "action": "lock_released",
                "diagram_id": diagram_id,
                "forced": True,
                "by_username": current_user.username
            }
        )
    else:
        if diagram.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this diagram."
            )

    db.delete(diagram)
    db.commit()
    return {"status": "success", "message": f"Diagram '{diagram.title}' deleted successfully."}


# Check out (lock) PFD diagram
@router.post("/{diagram_id}/checkout")
async def checkout_diagram(
    diagram_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    if diagram.project_id:
        role = get_user_project_role(db, diagram.project_id, current_user.id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this project's diagrams."
            )

    lock = acquire_lock(diagram_id, current_user.id, current_user.username)
    if lock["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This PFD is locked by {lock['username']}.",
            headers={"X-Locked-By": lock["username"]}
        )

    # Broadcast lock acquisition
    await collab_manager.broadcast_to_diagram(
        diagram_id,
        {
            "action": "lock_acquired",
            "diagram_id": diagram_id,
            "lock": lock
        }
    )

    return {"status": "success", "message": "Diagram checked out successfully.", "lock": lock}

# Check in (release lock)
@router.post("/{diagram_id}/checkin")
async def checkin_diagram(
    diagram_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    released = release_lock(diagram_id, current_user.id, force=False)
    if not released:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot check in: Lock is held by another user."
        )

    # Broadcast lock release
    await collab_manager.broadcast_to_diagram(
        diagram_id,
        {
            "action": "lock_released",
            "diagram_id": diagram_id,
            "user_id": current_user.id,
            "username": current_user.username
        }
    )

    return {"status": "success", "message": "Diagram checked in successfully."}

# Force check in (Project Owner override)
@router.post("/{diagram_id}/force-checkin")
async def force_checkin_diagram(
    diagram_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    if not diagram.project_id:
        # Standalone diagrams cannot be force checked in by anyone but the owner
        if diagram.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot force release lock on standalone diagram."
            )
    else:
        role = get_user_project_role(db, diagram.project_id, current_user.id)
        if role != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only project owners can force release check-out locks."
            )

    release_lock(diagram_id, current_user.id, force=True)

    # Broadcast lock release
    await collab_manager.broadcast_to_diagram(
        diagram_id,
        {
            "action": "lock_released",
            "diagram_id": diagram_id,
            "forced": True,
            "by_username": current_user.username
        }
    )

    return {"status": "success", "message": "Lock released successfully."}

# Get current lock status details
@router.get("/{diagram_id}/lock-status")
def get_diagram_lock_status(
    diagram_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    if diagram.project_id:
        role = get_user_project_role(db, diagram.project_id, current_user.id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this diagram."
            )

    lock = get_lock_status_info(diagram_id)
    return {
        "is_locked": lock is not None,
        "lock": lock
    }

