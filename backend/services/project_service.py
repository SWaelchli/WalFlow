"""Project service: membership, roles, permissions, and project-level helpers."""
import json
from typing import Optional, List
from sqlalchemy.orm import Session
from db.models import ProjectMember, Diagram, User


def get_user_project_role(db: Session, project_id: str, user_id: str) -> Optional[str]:
    """Returns the user's role in the given project, or None if not a member."""
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    return membership.role if membership else None


def user_can_access_diagram(db: Session, diagram: Diagram, user: User) -> bool:
    """Check if user has access to a diagram: project member or owner of standalone diagram."""
    if diagram.project_id:
        return bool(get_user_project_role(db, diagram.project_id, user.id))
    return diagram.user_id == user.id


def parse_allowed_pipe_classes(raw_val: Optional[str]) -> Optional[List[str]]:
    """Parse JSON string of allowed pipe classes into a list of class names."""
    if not raw_val:
        return None
    try:
        parsed = json.loads(raw_val)
        return parsed if isinstance(parsed, list) else None
    except Exception:
        return None
