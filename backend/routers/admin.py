from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User, Diagram
from auth import get_current_admin_user

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_admin_user)]
)

class RoleUpdateSchema(BaseModel):
    role: str

class UserAdminResponseSchema(BaseModel):
    id: str
    username: str
    role: str
    status: str
    created_at: str
    diagram_count: int

    class Config:
        from_attributes = True

@router.get("/users")
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    res = []
    for u in users:
        d_count = db.query(Diagram).filter(Diagram.user_id == u.id).count()
        created_at_str = ""
        c_at = getattr(u, "created_at", None)
        if c_at and hasattr(c_at, "isoformat"):
            created_at_str = c_at.isoformat()
        res.append({
            "id": u.id,
            "username": u.username,
            "role": getattr(u, "role", "user"),
            "status": getattr(u, "status", "approved"),
            "created_at": created_at_str,
            "diagram_count": d_count
        })
    return res

@router.get("/pending-users")
def get_pending_users(db: Session = Depends(get_db)):
    pending = db.query(User).filter(User.status == "pending_approval").all()
    res = []
    for u in pending:
        created_at_str = ""
        c_at = getattr(u, "created_at", None)
        if c_at and hasattr(c_at, "isoformat"):
            created_at_str = c_at.isoformat()
        res.append({
            "id": u.id,
            "username": u.username,
            "role": getattr(u, "role", "user"),
            "status": getattr(u, "status", "pending_approval"),
            "created_at": created_at_str,
            "diagram_count": 0
        })
    return res

@router.post("/users/{user_id}/approve")
def approve_user(user_id: str, db: Session = Depends(get_db)):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    target_user.status = "approved"
    db.commit()
    return {"status": "success", "message": f"User '{target_user.username}' has been approved."}

@router.post("/users/{user_id}/reject")
def reject_user(user_id: str, db: Session = Depends(get_db)):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    target_user.status = "rejected"
    db.commit()
    return {"status": "success", "message": f"User '{target_user.username}' has been rejected."}

@router.put("/users/{user_id}/role")
def update_user_role(user_id: str, payload: RoleUpdateSchema, db: Session = Depends(get_db)):
    if payload.role not in ["admin", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'admin' or 'user'.")
    
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    target_user.role = payload.role
    db.commit()
    return {"status": "success", "message": f"User '{target_user.username}' role updated to '{payload.role}'."}

@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    if admin_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account.")

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    username = target_user.username
    db.delete(target_user)
    db.commit()
    return {"status": "success", "message": f"User '{username}' deleted successfully."}

@router.get("/database/inspect")
def inspect_database(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    approved_users = db.query(User).filter(User.status == "approved").count()
    pending_users = db.query(User).filter(User.status == "pending_approval").count()
    rejected_users = db.query(User).filter(User.status == "rejected").count()
    admin_users = db.query(User).filter(User.role == "admin").count()
    
    diagrams = db.query(Diagram).all()
    diagram_list = []
    for d in diagrams:
        owner = db.query(User).filter(User.id == d.user_id).first()
        c_at = getattr(d, "created_at", None)
        u_at = getattr(d, "updated_at", None)
        diagram_list.append({
            "id": d.id,
            "title": d.title,
            "description": d.description or "",
            "owner_username": owner.username if owner else "Unknown",
            "created_at": c_at.isoformat() if c_at and hasattr(c_at, "isoformat") else "",
            "updated_at": u_at.isoformat() if u_at and hasattr(u_at, "isoformat") else "",
            "diagram_data": d.diagram_data
        })

    return {
        "stats": {
            "total_users": total_users,
            "approved_users": approved_users,
            "pending_users": pending_users,
            "rejected_users": rejected_users,
            "admin_users": admin_users,
            "total_diagrams": len(diagram_list)
        },
        "diagrams": diagram_list
    }

class DiagramReassignSchema(BaseModel):
    new_user_id: str

class DiagramMetadataSchema(BaseModel):
    title: str
    description: Optional[str] = None

@router.delete("/diagrams/{diagram_id}")
def admin_delete_diagram(diagram_id: str, db: Session = Depends(get_db)):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=404, detail="Diagram not found")
    title = diagram.title
    db.delete(diagram)
    db.commit()
    return {"status": "success", "message": f"Diagram '{title}' deleted."}

@router.post("/diagrams/{diagram_id}/duplicate")
def admin_duplicate_diagram(diagram_id: str, db: Session = Depends(get_db)):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=404, detail="Diagram not found")
    
    new_diagram = Diagram(
        user_id=diagram.user_id,
        title=f"Copy of {diagram.title}",
        description=diagram.description,
        diagram_data=diagram.diagram_data
    )
    db.add(new_diagram)
    db.commit()
    db.refresh(new_diagram)
    return {"status": "success", "message": f"Diagram duplicated as 'Copy of {diagram.title}'.", "id": new_diagram.id}

@router.put("/diagrams/{diagram_id}/reassign")
def admin_reassign_diagram(diagram_id: str, payload: DiagramReassignSchema, db: Session = Depends(get_db)):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=404, detail="Diagram not found")

    new_owner = db.query(User).filter(User.id == payload.new_user_id).first()
    if not new_owner:
        raise HTTPException(status_code=404, detail="Target user not found")

    diagram.user_id = new_owner.id
    db.commit()
    return {"status": "success", "message": f"Diagram ownership transferred to '{new_owner.username}'."}

@router.put("/diagrams/{diagram_id}/metadata")
def admin_update_diagram_metadata(diagram_id: str, payload: DiagramMetadataSchema, db: Session = Depends(get_db)):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=404, detail="Diagram not found")

    clean_title = payload.title.strip()
    if not clean_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty.")

    diagram.title = clean_title
    if payload.description is not None:
        diagram.description = payload.description
    db.commit()
    return {"status": "success", "message": "Diagram metadata updated."}
