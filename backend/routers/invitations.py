import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User, Project, ProjectMember, ProjectInvitation
from auth import get_current_user, hash_password, verify_password
from routers.projects import get_user_project_role

router = APIRouter(prefix="/api/invitations", tags=["invitations"])

# Pydantic Schemas
class InvitationCreateSchema(BaseModel):
    project_id: str
    recipient_username: Optional[str] = None
    password: Optional[str] = None
    expires_in_hours: int = 24

class InvitationAcceptSchema(BaseModel):
    password: Optional[str] = None

class InvitationSummarySchema(BaseModel):
    id: str
    token: str
    project_id: str
    recipient_username: Optional[str]
    has_password: bool
    expires_at: datetime
    used: bool

    class Config:
        from_attributes = True

@router.post("", response_model=InvitationSummarySchema, status_code=status.HTTP_201_CREATED)
def create_project_invitation(
    payload: InvitationCreateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify owner status
    role = get_user_project_role(db, payload.project_id, current_user.id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owners can generate sharing invitation links."
        )

    # Check recipient username if provided
    recipient_username_clean = None
    if payload.recipient_username:
        recipient_username_clean = payload.recipient_username.strip()
        recipient_user = db.query(User).filter(User.username == recipient_username_clean).first()
        if not recipient_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Recipient user '{recipient_username_clean}' not found."
            )

    token = secrets.token_urlsafe(32)
    pwd_hash = hash_password(payload.password.strip()) if payload.password else None
    
    expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.expires_in_hours)

    invitation = ProjectInvitation(
        token=token,
        project_id=payload.project_id,
        recipient_username=recipient_username_clean,
        password_hash=pwd_hash,
        expires_at=expires_at,
        created_by=current_user.id
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    return InvitationSummarySchema(
        id=invitation.id,
        token=invitation.token,
        project_id=invitation.project_id,
        recipient_username=invitation.recipient_username,
        has_password=pwd_hash is not None,
        expires_at=invitation.expires_at,
        used=invitation.used
    )

@router.post("/{token}/accept", status_code=status.HTTP_200_OK)
def accept_project_invitation(
    token: str,
    payload: InvitationAcceptSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invitation = db.query(ProjectInvitation).filter(ProjectInvitation.token == token).first()
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation link is invalid or has expired."
        )

    if invitation.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link has already been used."
        )

    # Check expiration (aware datetimes)
    # Ensure expires_at is timezone-aware
    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link has expired."
        )

    # Check username restriction
    if invitation.recipient_username and invitation.recipient_username.lower() != current_user.username.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation is restricted to a different user."
        )

    # Check password protection
    if invitation.password_hash:
        if not payload.password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Password is required to accept this invitation."
            )
        if not verify_password(payload.password, invitation.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect project invitation password."
            )

    # Check if target user is already a member
    existing_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == invitation.project_id,
        ProjectMember.user_id == current_user.id
    ).first()

    if not existing_membership:
        new_membership = ProjectMember(
            project_id=invitation.project_id,
            user_id=current_user.id,
            role="member"
        )
        db.add(new_membership)

    # Mark invitation as used
    invitation.used = True
    db.commit()

    project = db.query(Project).filter(Project.id == invitation.project_id).first()
    project_title = project.title if project else "Shared Project"

    return {
        "status": "success",
        "project_id": invitation.project_id,
        "project_title": project_title,
        "message": f"Successfully joined project '{project_title}' as a member."
    }
