import os
import json
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session, defer

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
    release_other_locks_of_user,
    user_holds_other_lock,
    get_lock_status_info,
    is_lock_holder,
    lock_released_message,
    LOCAL_LOCKS,
)

router = APIRouter(prefix="/api/diagrams", tags=["diagrams"])


def tab_session_id(request: Request) -> Optional[str]:
    """The browser tab the request comes from (X-Walflow-Session header, or ?session= for sendBeacon)."""
    value = request.headers.get("X-Walflow-Session") or request.query_params.get("session")
    return value[:100] if value else None


def user_can_access_diagram(db: Session, diagram: Diagram, user: User) -> bool:
    """Same rule as GET /diagrams/{id}: project members, or the owner of a standalone diagram."""
    if diagram.project_id:
        return bool(get_user_project_role(db, diagram.project_id, user.id))
    return diagram.user_id == user.id


def require_diagram_access(db: Session, diagram: Diagram, user: User):
    if not user_can_access_diagram(db, diagram, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this diagram."
        )


def _naive_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


class DiagramCreateSchema(BaseModel):
    title: str = "Untitled Diagram"
    description: Optional[str] = ""
    diagram_data: str  # JSON stringified nodes, edges, globalSettings
    project_id: Optional[str] = None

class DiagramUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    diagram_data: Optional[str] = None
    # updated_at of the version the client loaded or last saved; a newer server copy is not overwritten
    base_updated_at: Optional[str] = None

class DiagramSummarySchema(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str]
    title: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    lock_info: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)

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
        diagrams = db.query(Diagram).options(defer(Diagram.diagram_data)).filter(Diagram.project_id == project_id).order_by(Diagram.updated_at.desc()).all()
    else:
        # Standalone diagrams owned directly by user
        diagrams = db.query(Diagram).options(defer(Diagram.diagram_data)).filter(
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
    request: Request,
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
        
        # Lock lease enforcement: only the tab that holds the lock may save
        session_id = tab_session_id(request)
        lock = get_lock_status_info(diagram.id)
        if lock and not is_lock_holder(lock, current_user.id, session_id):
            detail = ("Cannot save: you are editing this diagram in another tab."
                      if lock["user_id"] == current_user.id
                      else f"Cannot save: Diagram is currently locked by {lock['username']}.")
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
        if not lock and payload.diagram_data is not None:
            # Drawing content of a project diagram is saved only by the tab that checked it out
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Cannot save: check out this diagram before editing it.")
    else:
        # Standalone diagram
        if diagram.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this diagram."
            )

    # Never overwrite a version the client has not seen (expired lock, two tabs, standalone diagrams)
    if payload.base_updated_at:
        try:
            base = _naive_utc(datetime.fromisoformat(payload.base_updated_at.replace("Z", "+00:00")))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid base_updated_at.")
        current = _naive_utc(diagram.updated_at) if diagram.updated_at else None
        if current and current != base:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This diagram was changed elsewhere since you opened it. Reload to see the latest version.",
                headers={"X-Walflow-Conflict": "stale"}
            )

    if diagram.project_id and lock:
        # Extend the caller's lease on save; a save to a free diagram does not check it out
        acquire_lock(diagram.id, current_user.id, current_user.username, session_id=session_id)

    changed = False
    if payload.title is not None and payload.title != diagram.title:
        diagram.title, changed = payload.title, True
    if payload.description is not None and payload.description != diagram.description:
        diagram.description, changed = payload.description, True
    if payload.diagram_data is not None and payload.diagram_data != diagram.diagram_data:
        diagram.diagram_data, changed = payload.diagram_data, True

    if changed:
        diagram.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(diagram)

        # Tell co-editors, at most once per interval; client_id lets the saving tab ignore its own notice
        await collab_manager.notify_diagram_updated(
            diagram_id,
            {
                "action": "diagram_updated",
                "diagram_id": diagram_id,
                "user_id": current_user.id,
                "username": current_user.username,
                "client_id": request.headers.get("X-Walflow-Client-Id")
            }
        )

    diagram.lock_info = get_lock_status_info(diagram.id)
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
        # Only current project members who own the project or created the diagram can delete it
        if role is None or (role != "owner" and diagram.user_id != current_user.id):
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
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    resume: bool = False
):
    """Check out (or refresh the lease of) a diagram for the calling tab. A user holds one lock at a time:
    checking out releases the user's lock on any other diagram.

    resume=true (heartbeat, reconnect) only keeps a lock this tab still has: it extends the tab's own lock,
    takes the diagram back if it is free and the user holds no other lock, and never releases other locks."""
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    require_diagram_access(db, diagram, current_user)   # also for standalone diagrams

    session_id = tab_session_id(request)
    was_free = get_lock_status_info(diagram_id) is None
    if resume and was_free and user_holds_other_lock(current_user.id, diagram_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are now editing another PFD.",
            headers={"X-Lock-Reason": "moved"}
        )
    lock = acquire_lock(diagram_id, current_user.id, current_user.username, session_id=session_id)
    if lock["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This PFD is locked by {lock['username']}.",
            headers={"X-Locked-By": lock["username"], "X-Lock-Reason": "other_user"}
        )
    if not is_lock_holder(lock, current_user.id, session_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are editing this PFD in another tab.",
            headers={"X-Locked-By": lock["username"], "X-Lock-Reason": "other_tab"}
        )

    if resume:
        if was_free:
            await collab_manager.broadcast_to_diagram(diagram_id, {"action": "lock_acquired", "diagram_id": diagram_id, "lock": lock})
        return {"status": "success", "message": "Lock kept.", "lock": lock}

    for other_id, other_lock in release_other_locks_of_user(current_user.id, diagram_id):
        await collab_manager.broadcast_to_diagram(other_id, lock_released_message(other_id, other_lock, "moved"))

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
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    require_diagram_access(db, diagram, current_user)

    session_id = tab_session_id(request)
    lock = get_lock_status_info(diagram_id)
    held_by_caller = is_lock_holder(lock, current_user.id, session_id)
    if lock and not held_by_caller:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=("Cannot check in: the lock is held by another tab of yours."
                    if lock.get("user_id") == current_user.id
                    else "Cannot check in: Lock is held by another user.")
        )
    release_lock(diagram_id, current_user.id, session_id=session_id)

    # Broadcast lock release only if the caller actually held the lock
    if held_by_caller:
        await collab_manager.broadcast_to_diagram(diagram_id, lock_released_message(diagram_id, lock, "checked_in"))

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

    require_diagram_access(db, diagram, current_user)   # also for standalone diagrams

    lock = get_lock_status_info(diagram_id)
    return {
        "is_locked": lock is not None,
        "lock": lock
    }

