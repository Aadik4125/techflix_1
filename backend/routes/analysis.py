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

import joblib
import os
import numpy as np
import traceback
from typing import Optional
from tools.feature_engineering import compute_text_features

# Lazy-loaded ML artifacts
_ML_ARTIFACTS = {}


def _load_ml_artifacts():
    global _ML_ARTIFACTS
    if _ML_ARTIFACTS:
        return _ML_ARTIFACTS
    # Go up one level from routes/ to backend/, then find tools/ at project root
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base = os.path.join(os.path.dirname(root), 'tools')
    try:
        clf = joblib.load(os.path.join(base, 'xgb_stress_classifier.joblib'))
        reg = joblib.load(os.path.join(base, 'xgb_stress_regressor.joblib'))
        vec = joblib.load(os.path.join(base, 'tfidf_vectorizer_xgb.joblib'))
        scaler = joblib.load(os.path.join(base, 'numeric_scaler_xgb.joblib'))
        with open(os.path.join(base, 'xgb_label_classes.json'), 'r', encoding='utf-8') as f:
            import json

            label_info = json.load(f)
            classes = label_info.get('classes', [])
    except Exception:
        print('[analysis] failed to load ML artifacts:')
        traceback.print_exc()
        return {}

    _ML_ARTIFACTS = {'clf': clf, 'reg': reg, 'vec': vec, 'scaler': scaler, 'classes': classes}
    return _ML_ARTIFACTS


class PredictResponse(BaseModel):
    predicted_class: Optional[str] = None
    class_probs: Optional[dict] = None
    regressed_score: Optional[float] = None


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

    # Add ML predictions (XGBoost) if artifacts available
    ml = _load_ml_artifacts()
    model_pred: Optional[PredictResponse] = None
    if ml:
        try:
            # build numeric features in same order as training
            numeric_feature_names = [
                'mfcc_variability_mean',
                'rms_mean',
                'zcr_mean',
                'spectral_centroid_mean',
                'harmonic_ratio',
                'tempo',
                'duration_sec',
                'speech_rate_estimate',
                'lexical_diversity',
                'sentiment_compound',
                'negative_ratio',
                'stress_keyword_count',
            ]

            # try to use last session acoustic/temporal/linguistic if present
            last_sess = (
                db.query(Session)
                .filter(Session.user_id == req.user_id)
                .order_by(Session.session_number.desc())
                .first()
            )
            a = last_sess.acoustic_features if last_sess and last_sess.acoustic_features else {}
            t = last_sess.temporal_features if last_sess and last_sess.temporal_features else {}
            l = last_sess.linguistic_features if last_sess and last_sess.linguistic_features else {}

            eng = compute_text_features(req.text)
            vals = []
            for k in numeric_feature_names:
                v = None
                if k in a:
                    v = a.get(k)
                elif k in t:
                    v = t.get(k)
                elif k in l:
                    v = l.get(k)
                elif k in eng:
                    v = eng.get(k)
                try:
                    vals.append(float(v) if v is not None else 0.0)
                except Exception:
                    vals.append(0.0)

            X_text = ml['vec'].transform([req.text])
            X_num = np.array(vals, dtype=float).reshape(1, -1)
            try:
                X_num_scaled = ml['scaler'].transform(X_num)
            except Exception as e:
                # Handle scaler feature-size mismatch by trimming or padding
                try:
                    expected = int(getattr(ml['scaler'], 'n_features_in_', X_num.shape[1]))
                    cur = X_num.shape[1]
                    if cur > expected:
                        X_num_adj = X_num[:, :expected]
                    elif cur < expected:
                        pad = np.zeros((1, expected - cur), dtype=float)
                        X_num_adj = np.hstack([X_num, pad])
                    else:
                        X_num_adj = X_num
                    X_num_scaled = ml['scaler'].transform(X_num_adj)
                except Exception:
                    print('[analysis] scaler transform failed:')
                    traceback.print_exc()
                    raise
            from scipy import sparse as _sps

            X_comb = _sps.hstack([X_text, _sps.csr_matrix(X_num_scaled)], format='csr')

            # classifier predicts encoded labels; our saved clf for XGB was trained on encoded labels
            clf = ml['clf']
            reg = ml['reg']
            # classification
            try:
                probs = clf.predict_proba(X_comb)[0]
                classes = ml.get('classes') or list(clf.classes_)
                class_probs = {c: float(p) for c, p in zip(classes, probs)}
                # choose best
                pred = classes[int(np.argmax(probs))]
            except Exception:
                # fallback if classifier has string classes
                pred = clf.predict(X_comb)[0]
                try:
                    probs = clf.predict_proba(X_comb)[0]
                    class_probs = {c: float(p) for c, p in zip(clf.classes_, probs)}
                except Exception:
                    class_probs = None

            # regression
            try:
                reg_score = float(reg.predict(X_comb)[0])
            except Exception:
                reg_score = None

            model_pred = PredictResponse(predicted_class=pred, class_probs=class_probs, regressed_score=reg_score)
        except Exception:
            print('[analysis] model prediction failed:')
            traceback.print_exc()
            model_pred = None

    return {
        'linguistic_features': linguistic,
        'baseline_ready': baseline is not None,
        'z_scores': z_scores,
        'drift': drift_data,
        'csi': csi_data,
        'model_prediction': model_pred.model_dump() if model_pred else None,
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
