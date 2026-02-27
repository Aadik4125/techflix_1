
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from config import DATABASE_URL


# SQLite needs connect_args for FastAPI threading; PostgreSQL does not
_connect_args = {'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {}
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=not DATABASE_URL.startswith('sqlite'),
    connect_args=_connect_args,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a DB session and auto-closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables (called on startup)."""
    Base.metadata.create_all(bind=engine)
    _apply_sqlite_migrations()


def _apply_sqlite_migrations():
    """Apply lightweight SQLite-only migrations for backward compatibility."""
    if not DATABASE_URL.startswith('sqlite'):
        return

    with engine.begin() as conn:
        rows = conn.exec_driver_sql('PRAGMA table_info(users)').fetchall()
        existing_cols = {row[1] for row in rows}

        if 'latest_csi_score' not in existing_cols:
            conn.execute(text('ALTER TABLE users ADD COLUMN latest_csi_score INTEGER'))
        if 'total_sessions' not in existing_cols:
            conn.execute(text('ALTER TABLE users ADD COLUMN total_sessions INTEGER DEFAULT 0'))
        if 'last_session_at' not in existing_cols:
            conn.execute(text('ALTER TABLE users ADD COLUMN last_session_at DATETIME'))
        if 'gender' not in existing_cols:
            conn.execute(text('ALTER TABLE users ADD COLUMN gender VARCHAR(24)'))
        if 'password_hash' not in existing_cols:
            conn.execute(text('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)'))
