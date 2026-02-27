"""
CogniVara - Cognitive Drift Detection
Rolling window averages, trend slopes, and deviation flagging.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from sqlalchemy.orm import Session as DBSession

from config import DRIFT_ROLLING_WINDOW, DRIFT_Z_THRESHOLD
from models.session import Session as SessionModel
from services.baseline import TRACKED_FEATURES


def _get_recent_z_scores(
    db: DBSession, user_id: int, window: int = DRIFT_ROLLING_WINDOW
) -> list[dict[str, float]]:
    """Fetch the Z-scores from the last N sessions."""
    sessions = (
        db.query(SessionModel)
        .filter(SessionModel.user_id == user_id, SessionModel.z_scores.isnot(None))
        .order_by(SessionModel.session_number.desc())
        .limit(window)
        .all()
    )

    result: list[dict[str, float]] = []
    for sess in reversed(sessions):
        if isinstance(sess.z_scores, dict):
            result.append({k: float(v) for k, v in sess.z_scores.items()})
    return result


def compute_drift(
    db: DBSession, user_id: int, current_z_scores: dict[str, float]
) -> dict[str, Any]:
    """
    Compute drift detection metrics:
    - Rolling average of Z-scores (last N sessions)
    - Trend slope (linear regression on last N Z-scores)
    - Deviation flags (|Z| > threshold AND negative slope)
    """
    recent = _get_recent_z_scores(db, user_id, DRIFT_ROLLING_WINDOW)

    all_z = recent + [current_z_scores] if current_z_scores else recent

    if len(all_z) < 2:
        return {
            'per_feature': {},
            'flagged_features': [],
            'overall_drift_score': 0.0,
            'sessions_analyzed': len(all_z),
        }

    per_feature: dict[str, dict[str, Any]] = {}
    flagged: list[str] = []

    for key in TRACKED_FEATURES:
        values = [float(z.get(key, 0.0)) for z in all_z]
        arr = np.array(values, dtype=float)

        rolling_avg = float(np.mean(arr))

        if len(arr) >= 2:
            x = np.arange(len(arr), dtype=float)
            coeffs = np.polyfit(x, arr, 1)
            slope = float(coeffs[0])
        else:
            slope = 0.0

        current_z = float(current_z_scores.get(key, 0.0)) if current_z_scores else 0.0

        is_flagged = abs(current_z) > DRIFT_Z_THRESHOLD and slope < 0

        per_feature[key] = {
            'rolling_avg': round(rolling_avg, 4),
            'slope': round(slope, 4),
            'current_z': round(current_z, 4),
            'flagged': is_flagged,
        }

        if is_flagged:
            flagged.append(key)

    all_current_z = [abs(float(current_z_scores.get(k, 0.0))) for k in TRACKED_FEATURES]
    overall_drift = float(np.mean(all_current_z)) if all_current_z else 0.0

    return {
        'per_feature': per_feature,
        'flagged_features': flagged,
        'overall_drift_score': round(overall_drift, 4),
        'sessions_analyzed': len(all_z),
    }
