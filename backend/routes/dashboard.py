"""
CogniVara — Dashboard Routes
GET /api/dashboard/{user_id} → Full dashboard data (CSI, trends, features)
GET /api/baseline/{user_id}  → Current baseline status
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from database import get_db
from models.user import User
from models.session import Session
from models.baseline import Baseline
from services.baseline import TRACKED_FEATURES, _merge_features

router = APIRouter()


@router.get('/dashboard/{user_id}')
def get_dashboard(user_id: int, db: DBSession = Depends(get_db)):

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    sessions = (
        db.query(Session)
        .filter(Session.user_id == user_id)
        .order_by(Session.session_number.asc())
        .all()
    )

    baseline = db.query(Baseline).filter(Baseline.user_id == user_id).first()

    # Latest session data
    latest = sessions[-1] if sessions else None
    latest_csi = latest.csi_score if latest else None
    latest_drift = latest.drift_scores if latest else None

    # Build longitudinal trend arrays
    trends = {key: [] for key in TRACKED_FEATURES}
    csi_trend = []
    session_labels = []

    for sess in sessions:
        session_labels.append(f'Session {sess.session_number}')
        csi_trend.append(sess.csi_score if sess.csi_score is not None else 50)

        merged = _merge_features(sess)

        for key in TRACKED_FEATURES:
            trends[key].append(merged.get(key, 0.0))

    # Key feature summary for the dashboard cards
    feature_summary = {}
    if latest:
        merged_latest = _merge_features(latest)

        feature_summary = {
            'mfcc_variance': merged_latest.get('mfcc_variance_avg', 0),
            'pitch_mean': merged_latest.get('pitch_mean', 0),
            'jitter': merged_latest.get('jitter_local', 0),
            'shimmer': merged_latest.get('shimmer_local', 0),
            'speech_rate': merged_latest.get('speech_rate', 0),
            'pause_variability': merged_latest.get('pause_variability', 0),
            'response_latency': merged_latest.get('response_latency', 0),
            'lexical_diversity': merged_latest.get('lexical_diversity', 0),
            'filler_ratio': merged_latest.get('filler_ratio', 0),
            'syntactic_complexity': merged_latest.get('syntactic_complexity', 0),
        }

    return {
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'age': user.age,
            'latest_csi_score': user.latest_csi_score,
            'total_sessions': user.total_sessions,
            'last_session_at': user.last_session_at.isoformat() if user.last_session_at else None,
        },
        'session_count': len(sessions),
        'baseline_ready': baseline is not None and baseline.feature_means is not None,
        'baseline_sessions': baseline.session_count if baseline else 0,

        # Latest scores
        'latest_csi': latest_csi,
        'latest_risk_level': (latest_drift or {}).get('per_feature', {}),
        'flagged_features': (latest_drift or {}).get('flagged_features', []),

        # Feature summary (latest session)
        'feature_summary': feature_summary,

        # Longitudinal trends
        'trends': {
            'labels': session_labels,
            'csi': csi_trend,
            'features': trends,
        },
    }


@router.get('/baseline/{user_id}')
def get_baseline_status(user_id: int, db: DBSession = Depends(get_db)):
    """Check baseline status for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    baseline = db.query(Baseline).filter(Baseline.user_id == user_id).first()
    session_count = db.query(Session).filter(Session.user_id == user_id).count()

    return {
        'user_id': user_id,
        'baseline_ready': baseline is not None and baseline.feature_means is not None,
        'sessions_completed': session_count,
        'sessions_needed': 3,
        'feature_means': baseline.feature_means if baseline else None,
        'feature_stds': baseline.feature_stds if baseline else None,
    }


@router.get('/users')
def list_users(db: DBSession = Depends(get_db)):
    """Temporary admin-style endpoint to inspect user rows as JSON."""
    users = db.query(User).order_by(User.id.desc()).all()
    return {
        'count': len(users),
        'users': [
            {
                'id': u.id,
                'name': u.name,
                'email': u.email,
                'age': u.age,
                'gender': u.gender,
                'latest_csi_score': u.latest_csi_score,
                'total_sessions': u.total_sessions,
                'last_session_at': u.last_session_at.isoformat() if u.last_session_at else None,
                'created_at': u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


@router.get('/sessions')
def list_sessions(db: DBSession = Depends(get_db)):
    """Temporary admin-style endpoint to inspect session rows as JSON."""
    sessions = db.query(Session).order_by(Session.id.desc()).all()
    return {
        'count': len(sessions),
        'sessions': [
            {
                'id': s.id,
                'user_id': s.user_id,
                'session_number': s.session_number,
                'transcript': s.transcript,
                'csi_score': s.csi_score,
                'created_at': s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ],
    }
