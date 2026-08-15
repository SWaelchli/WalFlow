import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Database path (stored locally or via DATABASE_PATH environment variable)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(BASE_DIR)
DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(BACKEND_DIR, "walflow.db"))

# Ensure destination directory exists
db_dir = os.path.dirname(DB_PATH)
if db_dir:
    os.makedirs(db_dir, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for obtaining a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


from sqlalchemy import inspect, text
import json

def init_db():
    """Initializes all database tables defined in SQLAlchemy ORM models and runs light migrations and seeding."""
    Base.metadata.create_all(bind=engine)
    
    # Run light migrations
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "users" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("users")]
            if "role" not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'user'"))
            if "status" not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN status VARCHAR DEFAULT 'approved'"))

        if "projects" in inspector.get_table_names():
            proj_cols = [c["name"] for c in inspector.get_columns("projects")]
            if "allowed_pipe_classes" not in proj_cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN allowed_pipe_classes TEXT"))
            if "allow_custom_pipes" not in proj_cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN allow_custom_pipes BOOLEAN DEFAULT 1"))

        conn.commit()


    # Seed default example pipe classes
    _seed_example_pipe_classes()



def _seed_example_pipe_classes():
    """Seeds the 4 default built-in example pipe classes if they do not already exist."""
    from .models import PipeClass
    from services.pipe_class_defaults import EXAMPLE_PIPE_CLASSES

    db = SessionLocal()
    try:
        for ex in EXAMPLE_PIPE_CLASSES:
            existing = db.query(PipeClass).filter(PipeClass.code == ex["code"]).first()
            if not existing:
                pipe_class = PipeClass(
                    id=ex["id"],
                    code=ex["code"],
                    name=ex["name"],
                    standard=ex["standard"],
                    material_group=ex["material_group"],
                    material_grade=ex["material_grade"],
                    rating_class=ex["rating_class"],
                    design_code=ex["design_code"],
                    roughness_mm=ex["roughness_mm"],
                    corrosion_allowance_mm=ex["corrosion_allowance_mm"],
                    min_temp_c=ex["min_temp_c"],
                    max_temp_c=ex["max_temp_c"],
                    revision=ex["revision"],
                    rev_date=ex["rev_date"],
                    source_plant_id=ex["source_plant_id"],
                    is_builtin=ex["is_builtin"],
                    sizes_json=json.dumps(ex["sizes"]),
                    temp_pressures_json=json.dumps(ex["temp_pressures"]),
                )
                db.add(pipe_class)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Warning] Failed to seed example pipe classes: {e}")
    finally:
        db.close()


