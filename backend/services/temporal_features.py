"""
CogniVara — Temporal Cognitive Feature Extraction
Response latency, speech rhythm, inter-word pause variability, speaking speed variability.
These relate to executive processing and cognitive load.
"""

import numpy as np
import librosa

from services.utils import safe_float as _safe_float


def extract_temporal_features(y: np.ndarray, sr: int,
                               intervals: list[tuple[int, int]]) -> dict:
    """
    Extract temporal cognitive features from the audio signal and
    its speech/silence intervals.

    Args:
        y: audio signal
        sr: sample rate
        intervals: list of (start_sample, end_sample) from preprocessing
    """
    total_duration = len(y) / sr

    if not intervals or total_duration == 0:
        return {
            'response_latency': 0.0,
            'rhythm_consistency': 0.0,
            'pause_variability': 0.0,
            'speed_variability': 0.0,
            'mean_pause_duration': 0.0,
            'max_pause_duration': 0.0,
            'pause_count': 0,
        }

    # ── Response Latency ──────────────────────────────────
    # Time before the first speech segment
    first_start = intervals[0][0] / sr
    response_latency = first_start

    # ── Segment durations ─────────────────────────────────
    segment_durations = [(e - s) / sr for s, e in intervals]

    # ── Pause durations (gaps between segments) ───────────
    pause_durations = []
    for i in range(1, len(intervals)):
        gap_start = intervals[i - 1][1]
        gap_end = intervals[i][0]
        pause_dur = (gap_end - gap_start) / sr
        if pause_dur > 0:
            pause_durations.append(pause_dur)

    # ── Speech Rhythm Consistency ─────────────────────────
    # Std deviation of segment durations (lower = more consistent)
    rhythm_consistency = float(np.std(segment_durations)) if len(segment_durations) > 1 else 0.0

    # ── Inter-word Pause Variability ──────────────────────
    # Std deviation of pause lengths
    pause_variability = float(np.std(pause_durations)) if len(pause_durations) > 1 else 0.0

    # ── Speaking Speed Variability ────────────────────────
    # Estimate local speech rate per segment using onset detection,
    # then compute variance
    local_rates = []
    for s, e in intervals:
        seg = y[s:e]
        seg_dur = (e - s) / sr
        if seg_dur < 0.1:
            continue
        onset_env = librosa.onset.onset_strength(y=seg, sr=sr)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        rate = len(onsets) / seg_dur
        local_rates.append(rate)

    speed_variability = float(np.var(local_rates)) if len(local_rates) > 1 else 0.0

    return {
        'response_latency': _safe_float(response_latency),
        'rhythm_consistency': _safe_float(rhythm_consistency),
        'pause_variability': _safe_float(pause_variability),
        'speed_variability': _safe_float(speed_variability),
        'mean_pause_duration': _safe_float(np.mean(pause_durations) if pause_durations else 0.0),
        'max_pause_duration': _safe_float(max(pause_durations) if pause_durations else 0.0),
        'pause_count': len(pause_durations),
    }
