import os
from sqlalchemy import create_engine, event
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
    SQLALCHEMY_DATABASE_URL,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    },
    pool_pre_ping=True,
    pool_recycle=3600,
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode = WAL")
    cursor.execute("PRAGMA synchronous = NORMAL")
    cursor.execute("PRAGMA busy_timeout = 10000")  # 10s timeout queue
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for obtaining a database session per request."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
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
            if "settings" not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN settings TEXT"))
            if "created_at" not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN created_at DATETIME"))

        if "projects" in inspector.get_table_names():
            proj_cols = [c["name"] for c in inspector.get_columns("projects")]
            if "allowed_pipe_classes" not in proj_cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN allowed_pipe_classes TEXT"))
            if "allow_custom_pipes" not in proj_cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN allow_custom_pipes BOOLEAN DEFAULT 1"))
            if "settings" not in proj_cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN settings TEXT"))

        if "pipe_classes" in inspector.get_table_names():
            pc_cols = [c["name"] for c in inspector.get_columns("pipe_classes")]
            if "reducer_standard_code" not in pc_cols:
                conn.execute(text("ALTER TABLE pipe_classes ADD COLUMN reducer_standard_code VARCHAR DEFAULT 'ASME_B16_9_REDUCERS'"))
            if "schedule_standard_code" not in pc_cols:
                conn.execute(text("ALTER TABLE pipe_classes ADD COLUMN schedule_standard_code VARCHAR DEFAULT 'ASME_B36_10M_SCHEDULES'"))
            if "reducer_standard_codes" not in pc_cols:
                conn.execute(text("ALTER TABLE pipe_classes ADD COLUMN reducer_standard_codes TEXT"))
            if "schedule_standard_codes" not in pc_cols:
                conn.execute(text("ALTER TABLE pipe_classes ADD COLUMN schedule_standard_codes TEXT"))

        conn.commit()


    # Seed default fitting standards (pipe classes reference them)
    _seed_example_fitting_standards()
    # Seed default example pipe classes
    _seed_example_pipe_classes()
    # Classes saved before sizes referenced the catalog
    _migrate_pipe_class_catalog_references()



def _seed_example_pipe_classes():
    """Seeds the 4 example pipe classes on a fresh install (empty table), so deleted examples stay deleted."""
    from .models import PipeClass
    from services.pipe_class_defaults import EXAMPLE_PIPE_CLASSES, example_to_pipe_class

    db = SessionLocal()
    try:
        if db.query(PipeClass).count() == 0:
            for ex in EXAMPLE_PIPE_CLASSES:
                db.add(example_to_pipe_class(ex))
        db.commit()
    except Exception as e:
        db.rollback()

        print(f"[Warning] Failed to seed example pipe classes: {e}")
    finally:
        db.close()


def _seed_example_fitting_standards():
    """Seeds default built-in fitting standards (e.g. ASME B16.9 Reducers, ASME B36.10M Schedules)."""
    from .models import FittingStandard
    from services.fitting_defaults import EXAMPLE_FITTING_STANDARDS

    db = SessionLocal()
    try:
        for ex in EXAMPLE_FITTING_STANDARDS:
            existing = db.query(FittingStandard).filter(FittingStandard.code == ex["code"]).first()
            if not existing:
                standard = FittingStandard(
                    id=ex["id"],
                    code=ex["code"],
                    name=ex["name"],
                    standard=ex["standard"],
                    fitting_type=ex["fitting_type"],
                    subtype=ex.get("subtype"),
                    description=ex.get("description"),
                    is_builtin=ex.get("is_builtin", False),
                    dimensions_json=json.dumps(ex["dimensions"]),
                )
                db.add(standard)
            elif existing.is_builtin and ex["fitting_type"] == "pipe_schedule":
                # Existing installs pick up added sizes and schedules; values already stored are kept
                existing.name = ex["name"]
                existing.subtype = ex.get("subtype")
                existing.description = ex.get("description")
                merged = _merge_schedule_rows(json.loads(existing.dimensions_json or "[]"), ex["dimensions"])
                existing.dimensions_json = json.dumps(merged)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Warning] Failed to seed example fitting standards: {e}")
    finally:
        db.close()


def _merge_schedule_rows(stored, seed):
    """Adds the seed's DN rows and schedule keys missing from `stored`; never overwrites stored values."""
    by_dn = {row.get("dn"): row for row in stored}
    for seed_row in seed:
        row = by_dn.get(seed_row["dn"])
        if row is None:
            stored.append(json.loads(json.dumps(seed_row)))
            continue
        schedules = row.setdefault("schedules", {})
        for sch, entry in seed_row["schedules"].items():
            schedules.setdefault(sch, dict(entry))
    stored.sort(key=lambda r: r.get("dn") or 0)
    return stored


def _migrate_pipe_class_catalog_references():
    """Classes without catalog lists: size rows with catalog dimensions become references (catalogs
    used are selected, the old single catalog first), other rows become custom rows."""
    from .models import PipeClass
    from services.pipe_class_catalog import (
        DEFAULT_REDUCER_CATALOG, DEFAULT_SCHEDULE_CATALOG, load_schedule_catalogs,
        normalize_codes, reference_rows_from_dimensions,
    )

    db = SessionLocal()
    try:
        pending = db.query(PipeClass).filter(PipeClass.schedule_standard_codes.is_(None)).all()
        if pending:
            catalogs = load_schedule_catalogs(db)
            for pc in pending:
                try:
                    sizes = json.loads(pc.sizes_json or "[]")
                except ValueError:
                    sizes = []
                old_code = normalize_codes(pc.schedule_standard_code, DEFAULT_SCHEDULE_CATALOG)
                rows, used = reference_rows_from_dimensions(sizes, catalogs, preferred=old_code)
                schedule_codes = used or old_code
                reducer_codes = normalize_codes(pc.reducer_standard_codes or pc.reducer_standard_code, DEFAULT_REDUCER_CATALOG)
                pc.sizes_json = json.dumps(rows)
                pc.schedule_standard_codes = json.dumps(schedule_codes)
                pc.schedule_standard_code = schedule_codes[0]
                pc.reducer_standard_codes = json.dumps(reducer_codes)
                pc.reducer_standard_code = reducer_codes[0]
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Warning] Failed to migrate pipe class sizes to catalog references: {e}")
    finally:
        db.close()



