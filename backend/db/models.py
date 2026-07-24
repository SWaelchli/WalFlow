import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
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
    role = Column(String, default="user", nullable=False)
    status = Column(String, default="approved", nullable=False)

    diagrams = relationship("Diagram", back_populates="owner", cascade="all, delete-orphan")

class Diagram(Base):
    __tablename__ = "diagrams"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False, default="Untitled Diagram")
    description = Column(Text, nullable=True)
    diagram_data = Column(Text, nullable=False)  # JSON serialized PFD graph
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    owner = relationship("User", back_populates="diagrams")
