from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User, Project, ProjectMember, Diagram
from auth import get_current_user
from services.lock_service import get_lock_status_info

router = APIRouter(prefix="/api/projects", tags=["projects"])

import json

# Pydantic Schemas
class ProjectCreateSchema(BaseModel):
    title: str = "Untitled Project"
    description: Optional[str] = ""
    allowed_pipe_classes: Optional[List[str]] = None
    allow_custom_pipes: Optional[bool] = True

class ProjectUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    allowed_pipe_classes: Optional[List[str]] = None
    allow_custom_pipes: Optional[bool] = None

class MemberSummarySchema(BaseModel):
    id: str
    user_id: str
    username: str
    role: str

    class Config:
        from_attributes = True

class DiagramSummarySchema(BaseModel):
    id: str
    title: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    lock_info: Optional[dict] = None

    class Config:
        from_attributes = True

class ProjectDetailSchema(BaseModel):
    id: str
    title: str
    description: Optional[str]
    allowed_pipe_classes: Optional[List[str]] = None
    allow_custom_pipes: bool = True
    created_at: datetime
    updated_at: datetime
    members: List[MemberSummarySchema]
    diagrams: List[DiagramSummarySchema]

    class Config:
        from_attributes = True

class ProjectSummarySchema(BaseModel):
    id: str
    title: str
    description: Optional[str]
    allowed_pipe_classes: Optional[List[str]] = None
    allow_custom_pipes: bool = True
    created_at: datetime
    updated_at: datetime
    role: str  # Current user's role in this project

    class Config:
        from_attributes = True


class MemberAddSchema(BaseModel):
    username: str
    role: str = "member"  # "owner" | "member"

class MemberRoleUpdateSchema(BaseModel):
    role: str

# Helper: Check if user has access & get role
def get_user_project_role(db: Session, project_id: str, user_id: str) -> Optional[str]:
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    return membership.role if membership else None

def _parse_allowed_pipe_classes(raw_val: Optional[str]) -> Optional[List[str]]:
    if not raw_val:
        return None
    try:
        parsed = json.loads(raw_val)
        return parsed if isinstance(parsed, list) else None
    except Exception:
        return None

@router.post("", response_model=ProjectDetailSchema, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Create the project
    allowed_classes_json = json.dumps(payload.allowed_pipe_classes) if payload.allowed_pipe_classes is not None else None
    new_project = Project(
        title=payload.title,
        description=payload.description or "",
        allowed_pipe_classes=allowed_classes_json,
        allow_custom_pipes=payload.allow_custom_pipes if payload.allow_custom_pipes is not None else True
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    # 2. Add creator as "owner"
    owner_membership = ProjectMember(
        project_id=new_project.id,
        user_id=current_user.id,
        role="owner"
    )
    db.add(owner_membership)
    db.commit()
    
    # Reload and return project details
    db.refresh(new_project)
    
    # Map relationships manually for schema parsing if needed
    members_list = [
        MemberSummarySchema(
            id=owner_membership.id,
            user_id=current_user.id,
            username=current_user.username,
            role="owner"
        )
    ]
    
    return ProjectDetailSchema(
        id=new_project.id,
        title=new_project.title,
        description=new_project.description,
        allowed_pipe_classes=_parse_allowed_pipe_classes(new_project.allowed_pipe_classes),
        allow_custom_pipes=new_project.allow_custom_pipes if new_project.allow_custom_pipes is not None else True,
        created_at=new_project.created_at,
        updated_at=new_project.updated_at,
        members=members_list,
        diagrams=[]
    )

@router.get("", response_model=List[ProjectSummarySchema])
def list_user_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    memberships = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()
    results = []
    for m in memberships:
        p = m.project
        if p:
            results.append(ProjectSummarySchema(
                id=p.id,
                title=p.title,
                description=p.description,
                allowed_pipe_classes=_parse_allowed_pipe_classes(p.allowed_pipe_classes),
                allow_custom_pipes=p.allow_custom_pipes if p.allow_custom_pipes is not None else True,
                created_at=p.created_at,
                updated_at=p.updated_at,
                role=m.role
            ))
    # Order by updated_at desc
    results.sort(key=lambda x: x.updated_at, reverse=True)
    return results

@router.get("/{project_id}", response_model=ProjectDetailSchema)
def get_project_detail(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    role = get_user_project_role(db, project_id, current_user.id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project."
        )
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found."
        )

    # Format members lists
    members_formatted = []
    for m in project.members:
        u = m.user
        if u:
            members_formatted.append(MemberSummarySchema(
                id=m.id,
                user_id=m.user_id,
                username=u.username,
                role=m.role
            ))
            
    # Format diagrams list
    diagrams_formatted = [
        DiagramSummarySchema(
            id=d.id,
            title=d.title,
            description=d.description,
            created_at=d.created_at,
            updated_at=d.updated_at,
            lock_info=get_lock_status_info(d.id)
        )
        for d in project.diagrams
    ]

    return ProjectDetailSchema(
        id=project.id,
        title=project.title,
        description=project.description,
        allowed_pipe_classes=_parse_allowed_pipe_classes(project.allowed_pipe_classes),
        allow_custom_pipes=project.allow_custom_pipes if project.allow_custom_pipes is not None else True,
        created_at=project.created_at,
        updated_at=project.updated_at,
        members=members_formatted,
        diagrams=diagrams_formatted
    )

@router.put("/{project_id}", response_model=ProjectDetailSchema)
def update_project(
    project_id: str,
    payload: ProjectUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    role = get_user_project_role(db, project_id, current_user.id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owners can modify project settings."
        )

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    fields_set = getattr(payload, 'model_fields_set', getattr(payload, '__fields_set__', set()))

    if "title" in fields_set and payload.title is not None:
        project.title = payload.title
    if "description" in fields_set and payload.description is not None:
        project.description = payload.description
    if "allowed_pipe_classes" in fields_set:
        project.allowed_pipe_classes = json.dumps(payload.allowed_pipe_classes) if payload.allowed_pipe_classes is not None else None
    if "allow_custom_pipes" in fields_set and payload.allow_custom_pipes is not None:
        project.allow_custom_pipes = payload.allow_custom_pipes

    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    
    return get_project_detail(project_id, current_user, db)




@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    role = get_user_project_role(db, project_id, current_user.id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owners can delete this project."
        )

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    db.delete(project)
    db.commit()
    return {"status": "success", "message": f"Project '{project.title}' deleted successfully."}

# Add a team member
@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
def add_project_member(
    project_id: str,
    payload: MemberAddSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    role = get_user_project_role(db, project_id, current_user.id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owners can add members."
        )

    # Check if target user exists
    target_user = db.query(User).filter(User.username == payload.username.strip()).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{payload.username}' not found."
        )

    # Check if target user is already a member
    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == target_user.id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this project."
        )

    new_member = ProjectMember(
        project_id=project_id,
        user_id=target_user.id,
        role=payload.role if payload.role in ("owner", "member") else "member"
    )
    db.add(new_member)
    db.commit()
    return {"status": "success", "message": f"User '{target_user.username}' added to project."}

# Update member role
@router.put("/{project_id}/members/{member_id}")
def update_project_member_role(
    project_id: str,
    member_id: str,
    payload: MemberRoleUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    role = get_user_project_role(db, project_id, current_user.id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owners can update roles."
        )

    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.id == member_id
    ).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project member entry not found."
        )

    # Owner safeguard: Can't change own role if they are the only owner
    if member.user_id == current_user.id and payload.role != "owner":
        owners_count = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.role == "owner"
        ).count()
        if owners_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote yourself. You are the sole owner of this project."
            )

    member.role = payload.role if payload.role in ("owner", "member") else "member"
    db.commit()
    return {"status": "success", "message": "Member role updated successfully."}

# Remove a team member (or leave)
@router.delete("/{project_id}/members/{member_id}")
def remove_project_member(
    project_id: str,
    member_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Retrieve project member record to check user_id
    member_to_remove = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.id == member_id
    ).first()
    
    if not member_to_remove:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found."
        )

    role = get_user_project_role(db, project_id, current_user.id)
    
    # Only owners can remove others; members can only delete themselves (leaving)
    is_removing_self = member_to_remove.user_id == current_user.id
    if not is_removing_self and role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owners can remove other members."
        )

    # Owner safeguard: Sole owner cannot leave without promoting another owner
    if is_removing_self and member_to_remove.role == "owner":
        owners_count = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.role == "owner"
        ).count()
        if owners_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot leave this project because you are the sole owner. Demote or delete the project instead."
            )

    db.delete(member_to_remove)
    db.commit()
    return {"status": "success", "message": "Member removed from project."}
