from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from database import get_db
from models.baseline import Baseline
from models.session import Session
from models.user import User
from services.baseline import compute_z_scores
from services.csi import compute_csi
from services.drift import compute_drift
from services.linguistic_features import extract_linguistic_features

router = APIRouter()


class AnalyzeRequest(BaseModel):
    user_id: int
    text: str


@router.post('/analyze')
def analyze_text(req: AnalyzeRequest, db: DBSession = Depends(get_db)):
    
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    linguistic = extract_linguistic_features(req.text)

    baseline = db.query(Baseline).filter(Baseline.user_id == req.user_id).first()

    z_scores = {}
    drift_data = {}
    csi_data = {
        'csi_score': 50,
        'risk_level': 'unknown',
        'interpretation': 'Text-only analysis - limited cognitive assessment.',
    }

    if (
        baseline is not None
        and isinstance(baseline.feature_means, dict)
        and isinstance(baseline.feature_stds, dict)
    ):
        z_scores = compute_z_scores(baseline, linguistic)
        drift_data = compute_drift(db, req.user_id, z_scores)
        csi_data = compute_csi(z_scores, drift_data)

    return {
        'linguistic_features': linguistic,
        'baseline_ready': baseline is not None,
        'z_scores': z_scores,
        'drift': drift_data,
        'csi': csi_data,
    }


@router.get('/sessions/{user_id}')
def get_sessions(user_id: int, db: DBSession = Depends(get_db)):
    """Retrieve all sessions for a user, ordered chronologically."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    sessions = (
        db.query(Session)
        .filter(Session.user_id == user_id)
        .order_by(Session.session_number.asc())
        .all()
    )

    return {
        'user_id': user_id,
        'session_count': len(sessions),
        'sessions': [
            {
                'id': sess.id,
                'session_number': sess.session_number,
                'transcript': sess.transcript,
                'acoustic_features': sess.acoustic_features,
                'temporal_features': sess.temporal_features,
                'linguistic_features': sess.linguistic_features,
                'z_scores': sess.z_scores,
                'csi_score': sess.csi_score,
                'created_at': sess.created_at.isoformat() if sess.created_at else None,
            }
            for sess in sessions
        ],
    }
