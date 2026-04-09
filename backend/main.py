from contextlib import asynccontextmanager
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend-local absolute imports (config/database/routes/...) work
# when launched as either:
# - python backend/main.py
# - uvicorn backend.main:app
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from config import CORS_ORIGINS, DATABASE_URL, FASTAPI_PORT
from database import SessionLocal, create_tables
from models.session import Session
from models.user import User

# Import routes
from routes.audio import router as audio_router
from routes.analysis import router as analysis_router
from routes.dashboard import router as dashboard_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    
    create_tables()

    # Do not download at startup. Offline environments should still boot.
    import nltk

    for resource in [
        'tokenizers/punkt_tab',
        'taggers/averaged_perceptron_tagger_eng',
        'corpora/stopwords',
    ]:
        try:
            nltk.data.find(resource)
        except LookupError:
            pass

    yield


app = FastAPI(
    title='CogniVara - Cognitive Risk Analysis API',
    version='1.0.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(audio_router, prefix='/api', tags=['Audio'])
app.include_router(analysis_router, prefix='/api', tags=['Analysis'])
app.include_router(dashboard_router, prefix='/api', tags=['Dashboard'])


@app.get('/api/health')
def health_check():
    db_kind = 'postgres' if DATABASE_URL.startswith('postgresql+') else 'sqlite'
    users = None
    sessions = None
    db = None
    try:
        db = SessionLocal()
        users = db.query(User).count()
        sessions = db.query(Session).count()
    except Exception:
        pass
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass

    return {
        'status': 'ok',
        'service': 'cognivara-backend',
        'database': db_kind,
        'users': users,
        'sessions': sessions,
    }


@app.get('/')
def root():
    return {'service': 'cognivara-backend', 'status': 'ok', 'docs': '/docs'}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=FASTAPI_PORT, reload=False)
