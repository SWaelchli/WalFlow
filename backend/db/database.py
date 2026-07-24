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

def init_db():
    """Initializes all database tables defined in SQLAlchemy ORM models and runs light migrations."""
    Base.metadata.create_all(bind=engine)
    
    # Check if role and status columns exist in users table
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "users" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("users")]
            if "role" not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'user'"))
            if "status" not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN status VARCHAR DEFAULT 'approved'"))
            conn.commit()

