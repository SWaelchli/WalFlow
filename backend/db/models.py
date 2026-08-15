import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Index, Boolean, Float, Integer
from sqlalchemy.orm import relationship
from .database import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)  # "admin" | "pipe_manager" | "user"
    status = Column(String, default="approved", nullable=False)

    diagrams = relationship("Diagram", back_populates="owner", cascade="all, delete-orphan")
    project_memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False, default="Untitled Project")
    description = Column(Text, nullable=True)
    allowed_pipe_classes = Column(Text, nullable=True)  # JSON list of allowed pipe class IDs
    allow_custom_pipes = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    diagrams = relationship("Diagram", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        Index("idx_project_members_user_project", "user_id", "project_id", unique=True),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String, default="member", nullable=False)  # "owner" | "member"

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")

class ProjectInvitation(Base):
    __tablename__ = "project_invitations"

    id = Column(String, primary_key=True, default=generate_uuid)
    token = Column(String, unique=True, index=True, nullable=False)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    recipient_username = Column(String, nullable=True)  # Restrict invitation to a specific user if set
    password_hash = Column(String, nullable=True)  # Optional password protection for link
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)

    project = relationship("Project")

class Diagram(Base):
    __tablename__ = "diagrams"
    __table_args__ = (
        Index("idx_user_diagrams_updated_at", "user_id", "updated_at"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True, index=True)
    title = Column(String, nullable=False, default="Untitled Diagram")
    description = Column(Text, nullable=True)
    diagram_data = Column(Text, nullable=False)  # JSON serialized PFD graph
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    owner = relationship("User", back_populates="diagrams")
    project = relationship("Project", back_populates="diagrams")


class PipeClass(Base):
    __tablename__ = "pipe_classes"
    __table_args__ = (
        Index("idx_pipe_classes_code", "code", unique=True),
        Index("idx_pipe_classes_standard", "standard"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    code = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    standard = Column(String, nullable=False, default="CUSTOM")  # "WALFLOW_EXAMPLE" | "TR2000" | "CUSTOM"
    material_group = Column(String, nullable=False)  # "CS", "CSLT", "316SS", "DX", "TI"
    material_grade = Column(String, nullable=False)  # "ASTM A106 Gr. B", "ASTM A312 TP316L"
    rating_class = Column(String, nullable=False)  # "CL150", "CL300", "PN16", "PN40"
    design_code = Column(String, nullable=False, default="ASME B31.3")
    roughness_mm = Column(Float, nullable=False, default=0.045)
    corrosion_allowance_mm = Column(Float, nullable=False, default=0.0)
    min_temp_c = Column(Float, nullable=True)
    max_temp_c = Column(Float, nullable=True)
    revision = Column(String, nullable=False, default="1.0")
    rev_date = Column(String, nullable=True)
    source_plant_id = Column(Integer, nullable=True)
    is_builtin = Column(Boolean, default=False, nullable=False)
    sizes_json = Column(Text, nullable=False)  # JSON array of sizes
    temp_pressures_json = Column(Text, nullable=True)  # JSON array of P-T rating points
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


