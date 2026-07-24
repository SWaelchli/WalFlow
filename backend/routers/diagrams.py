from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User, Diagram
from auth import get_current_user

router = APIRouter(prefix="/api/diagrams", tags=["diagrams"])

class DiagramCreateSchema(BaseModel):
    title: str = "Untitled Diagram"
    description: Optional[str] = ""
    diagram_data: str  # JSON stringified nodes, edges, globalSettings

class DiagramUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    diagram_data: Optional[str] = None

class DiagramSummarySchema(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DiagramDetailSchema(DiagramSummarySchema):
    diagram_data: str

@router.get("", response_model=List[DiagramSummarySchema])
def list_user_diagrams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagrams = db.query(Diagram).filter(Diagram.user_id == current_user.id).order_by(Diagram.updated_at.desc()).all()
    return diagrams

@router.get("/{diagram_id}", response_model=DiagramDetailSchema)
def get_diagram_detail(
    diagram_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id, Diagram.user_id == current_user.id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")
    return diagram

@router.post("", response_model=DiagramDetailSchema, status_code=status.HTTP_201_CREATED)
def create_diagram(
    payload: DiagramCreateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_diagram = Diagram(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description or "",
        diagram_data=payload.diagram_data
    )
    db.add(new_diagram)
    db.commit()
    db.refresh(new_diagram)
    return new_diagram

@router.put("/{diagram_id}", response_model=DiagramDetailSchema)
def update_diagram(
    diagram_id: str,
    payload: DiagramUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id, Diagram.user_id == current_user.id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    if payload.title is not None:
        diagram.title = payload.title
    if payload.description is not None:
        diagram.description = payload.description
    if payload.diagram_data is not None:
        diagram.diagram_data = payload.diagram_data
    
    diagram.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(diagram)
    return diagram

@router.delete("/{diagram_id}", status_code=status.HTTP_200_OK)
def delete_diagram(
    diagram_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id, Diagram.user_id == current_user.id).first()
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagram not found.")

    db.delete(diagram)
    db.commit()
    return {"status": "success", "message": f"Diagram '{diagram.title}' deleted successfully."}
