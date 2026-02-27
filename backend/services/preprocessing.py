"""
CogniVara - Audio Preprocessing Service
Noise reduction, silence segmentation, and voice activity estimation.
"""

from __future__ import annotations

from typing import TypedDict

import librosa
import numpy as np
from scipy.signal import butter, sosfilt


class PreprocessResult(TypedDict):
    y_clean: np.ndarray
    y_speech: np.ndarray
    intervals: list[tuple[int, int]]
    speech_ratio: float
    duration_sec: float
    speech_duration_sec: float
    num_segments: int


def _bandpass_coefficients(lowcut: float, highcut: float, sr: int, order: int = 5):
    nyq = sr / 2.0
    low = max(lowcut / nyq, 0.001)
    high = min(highcut / nyq, 0.999)
    return butter(order, [low, high], btype='band', output='sos')


def noise_reduce(
    y: np.ndarray, sr: int, lowcut: float = 300.0, highcut: float = 3400.0
) -> np.ndarray:
    """Apply bandpass filter to isolate the voice frequency band."""
    sos = _bandpass_coefficients(lowcut, highcut, sr)
    filtered = np.asarray(sosfilt(sos, y), dtype=np.float32)
    return filtered


def preprocess_audio(y: np.ndarray, sr: int) -> PreprocessResult:
    """
    Run the full preprocessing pipeline.
    Returns cleaned signal, speech-only signal, intervals, and metadata.
    """
    y_clean = noise_reduce(y, sr)

    split_intervals = np.asarray(librosa.effects.split(y_clean, top_db=25), dtype=np.int64)
    intervals: list[tuple[int, int]] = [
        (int(start), int(end)) for start, end in split_intervals.tolist()
    ]

    if intervals:
        y_speech = np.concatenate([y_clean[start:end] for start, end in intervals])
    else:
        y_speech = y_clean

    rms = np.asarray(librosa.feature.rms(y=y_clean)[0], dtype=np.float32)
    energy_norm = rms / (float(rms.max()) + 1e-10)
    speech_ratio = float((energy_norm > 0.01).mean()) if len(energy_norm) > 0 else 0.0

    return {
        'y_clean': y_clean,
        'y_speech': y_speech,
        'intervals': intervals,
        'speech_ratio': speech_ratio,
        'duration_sec': float(len(y)) / sr,
        'speech_duration_sec': float(len(y_speech)) / sr,
        'num_segments': len(intervals),
    }
