"""
CogniVara — Configuration
Loads environment variables for database, server, and analysis settings.
"""

import os
from dotenv import load_dotenv

# Load .env from project root (one level up from backend/)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# ── Database ──────────────────────────────────────────────
# Default: SQLite (zero setup). Set DATABASE_URL in .env for PostgreSQL.
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'sqlite:///' + os.path.join(os.path.dirname(__file__), 'cognivara.db')
)
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql+psycopg://', 1)
elif DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg://', 1)

# ── Server ────────────────────────────────────────────────
FASTAPI_PORT = int(os.getenv('FASTAPI_PORT', '8000'))
CORS_ORIGINS = os.getenv(
    'CORS_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500,null',
).split(',')

# ── Analysis Tuning ──────────────────────────────────────
BASELINE_SESSION_COUNT = int(os.getenv('BASELINE_SESSION_COUNT', '3'))
DRIFT_ROLLING_WINDOW = int(os.getenv('DRIFT_ROLLING_WINDOW', '3'))
DRIFT_Z_THRESHOLD = float(os.getenv('DRIFT_Z_THRESHOLD', '1.5'))

# ── Audio ─────────────────────────────────────────────────
AUDIO_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(AUDIO_UPLOAD_DIR, exist_ok=True)

# ── CSI Weights (equal by default) ────────────────────────
CSI_WEIGHTS = {
    'mfcc_variance': 0.25,
    'pause_variability': 0.25,
    'lexical_diversity': 0.25,
    'speech_rate_variance': 0.25,
}
