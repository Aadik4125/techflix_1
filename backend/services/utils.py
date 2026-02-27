"""Shared utilities for feature extraction services."""

import numpy as np


def safe_float(v) -> float:
    """Convert numpy scalar to Python float, handle NaN/Inf."""
    f = float(v)
    return 0.0 if np.isnan(f) or np.isinf(f) else round(f, 6)
