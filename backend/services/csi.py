"""
CogniVara - Composite Cognitive Stability Index (CSI)
Weighted combination of normalized feature drifts into a single 0-100 score.
Higher CSI = more cognitive stability. Lower CSI = more concern.
"""

from __future__ import annotations

import math

from config import CSI_WEIGHTS


_Z_SCORE_NOISE_FLOOR = 0.35
_Z_SCORE_CAP = 3.5
_CSI_DECAY = 1.15


def _normalize_z_deviation(value: float) -> float:
    """
    Normalize absolute z-score to 0..1 with a noise floor and hard cap.

    - |z| <= 0.5 is treated as normal session-to-session noise.
    - |z| >= 3.0 is treated as maximum concerning deviation.
    """
    abs_z = abs(float(value))
    if abs_z <= _Z_SCORE_NOISE_FLOOR:
        return 0.0
    scaled = (abs_z - _Z_SCORE_NOISE_FLOOR) / (_Z_SCORE_CAP - _Z_SCORE_NOISE_FLOOR)
    return max(0.0, min(1.0, scaled))


def compute_csi(z_scores: dict, drift_data: dict) -> dict:
    """Compute the Composite Cognitive Stability Index."""
    if not z_scores:
        return {
            'csi_score': 50,
            'components': {},
            'interpretation': 'Insufficient data for CSI computation.',
            'risk_level': 'unknown',
        }

    raw_components = {
        'mfcc_variance': z_scores.get('mfcc_variance_avg', 0.0),
        'pause_variability': z_scores.get('pause_variability', 0.0),
        'lexical_diversity': z_scores.get('lexical_diversity', 0.0),
        'speech_rate_variance': z_scores.get('speed_variability', 0.0),
    }
    components = {
        key: _normalize_z_deviation(val) for key, val in raw_components.items()
    }

    # Blend weighted mean with max component to keep sensitivity to single strong shifts.
    weighted_mean = sum(CSI_WEIGHTS.get(key, 0.25) * val for key, val in components.items())
    max_component = max(components.values()) if components else 0.0
    weighted_sum = (0.65 * weighted_mean) + (0.35 * max_component)

    # Reliability-focused decay with gentler slope to reduce overreaction.
    raw_csi = 100.0 * math.exp(-_CSI_DECAY * weighted_sum)
    csi_score = int(max(0, min(100, round(raw_csi))))

    if drift_data and drift_data.get('flagged_features'):
        penalty = min(12, len(drift_data['flagged_features']) * 3)
        csi_score = max(0, csi_score - penalty)

    if csi_score >= 75:
        risk_level = 'low'
        interpretation = (
            'Your cognitive speech patterns are stable and consistent with '
            'your personal baseline. No significant deviations detected.'
        )
    elif csi_score >= 45:
        risk_level = 'moderate'
        flagged = drift_data.get('flagged_features', []) if drift_data else []
        flag_str = ', '.join(f.replace('_', ' ') for f in flagged[:3]) if flagged else 'some dimensions'
        interpretation = (
            f'Moderate deviation detected in {flag_str}. '
            'Continued monitoring recommended to distinguish transient '
            'fluctuation from sustained drift.'
        )
    else:
        risk_level = 'high'
        interpretation = (
            'Significant cognitive speech pattern changes detected across '
            'multiple biomarkers. This sustained deviation from your baseline '
            'warrants closer attention and potential clinical consultation.'
        )

    return {
        'csi_score': csi_score,
        'components': {k: round(v, 4) for k, v in components.items()},
        'raw_components_z': {k: round(abs(float(v)), 4) for k, v in raw_components.items()},
        'weighted_drift': round(weighted_sum, 4),
        'formula_version': 'csi_v4_sensitive_blend',
        'interpretation': interpretation,
        'risk_level': risk_level,
    }
