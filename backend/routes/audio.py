
from __future__ import annotations

import io
import os
import uuid
import hashlib
import re
from typing import Any

import librosa
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session as DBSession

from config import AUDIO_UPLOAD_DIR, FAST_ANALYSIS_MODE
from database import get_db
from models.session import Session
from models.user import User
from services.acoustic_features import extract_all_acoustic_features
from services.baseline import compute_baseline, compute_z_scores
from services.csi import compute_csi
from services.drift import compute_drift
from services.linguistic_features import extract_linguistic_features
from services.preprocessing import preprocess_audio
from services.temporal_features import extract_temporal_features

router = APIRouter()


def _hash_password(password: str) -> str:
    """PBKDF2 hash for persisted credentials in demo environment."""
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 200_000)
    return f'pbkdf2_sha256${salt.hex()}${digest.hex()}'


def _fast_linguistic_fallback(text: str) -> dict[str, float]:
    words = re.findall(r"[a-zA-Z']+", text.lower() if text else '')
    word_count = len(words)
    unique_count = len(set(words))
    filler_set = {'um', 'uh', 'like', 'actually', 'basically', 'so', 'well', 'right'}
    filler_count = sum(1 for w in words if w in filler_set)
    lexical_diversity = (unique_count / word_count) if word_count else 0.0
    filler_ratio = (filler_count / word_count) if word_count else 0.0
    sentence_count = max(1, text.count('.') + text.count('!') + text.count('?')) if text else 0
    sentence_length_mean = (word_count / sentence_count) if sentence_count else 0.0
    return {
        'sentence_length_mean': round(float(sentence_length_mean), 4),
        'lexical_diversity': round(float(lexical_diversity), 4),
        'avg_word_length': round(float(sum(len(w) for w in words) / word_count), 4) if word_count else 0.0,
        'filler_ratio': round(float(filler_ratio), 4),
        'content_word_ratio': round(float(max(0.0, 1.0 - filler_ratio)), 4),
        'syntactic_complexity': round(float(min(3.0, sentence_count / 3.0)), 4),
        'vocabulary_richness': round(float((word_count ** (unique_count ** -0.172)) if unique_count > 0 else 0.0), 4),
        'word_count': word_count,
        'sentence_count': sentence_count,
    }

@router.post('/user')
def create_or_update_user(
    name: str = Form(...),
    email: str = Form(...),
    age: int | None = Form(None),
    gender: str | None = Form(None),
    password: str | None = Form(None),
    db: DBSession = Depends(get_db),
):
    """Create a new user or return existing user by email."""
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        existing.name = name
        if age is not None:
            existing.age = age
        if gender is not None:
            existing.gender = gender
        if password:
            existing.password_hash = _hash_password(password)
        db.commit()
        db.refresh(existing)
        return {
            'user_id': existing.id,
            'name': existing.name,
            'email': existing.email,
            'age': existing.age,
            'gender': existing.gender,
            'latest_csi_score': existing.latest_csi_score,
            'total_sessions': existing.total_sessions,
            'last_session_at': existing.last_session_at.isoformat() if existing.last_session_at else None,
            'status': 'updated',
        }

    user = User(
        name=name,
        email=email,
        age=age,
        gender=gender,
        password_hash=_hash_password(password) if password else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        'user_id': user.id,
        'name': user.name,
        'email': user.email,
        'age': user.age,
        'gender': user.gender,
        'latest_csi_score': user.latest_csi_score,
        'total_sessions': user.total_sessions,
        'last_session_at': user.last_session_at.isoformat() if user.last_session_at else None,
        'status': 'created',
    }


@router.post('/upload')
async def upload_and_analyze(
    audio: UploadFile = File(...),
    user_id: int = Form(...),
    transcript: str = Form(''),
    db: DBSession = Depends(get_db),
):
    """
    Full cognitive analysis pipeline:
    1. Save audio
    2. Load & preprocess (noise filter, VAD, segmentation)
    3. Extract acoustic features (MFCCs, pitch, jitter, shimmer, etc.)
    4. Extract temporal features (latency, rhythm, pauses)
    5. Extract linguistic features from transcript (NLTK)
    6. Compute baseline (if enough sessions)
    7. Compute Z-scores
    8. Compute drift detection
    9. Compute CSI
    10. Store everything in DB
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    last_session = (
        db.query(Session)
        .filter(Session.user_id == user_id)
        .order_by(Session.session_number.desc())
        .first()
    )
    session_number = (last_session.session_number + 1) if last_session else 1

    file_ext = os.path.splitext(audio.filename or 'recording.wav')[1] or '.wav'
    filename = f'user_{user_id}_session_{session_number}_{uuid.uuid4().hex[:8]}{file_ext}'
    filepath = os.path.join(AUDIO_UPLOAD_DIR, filename)

    audio_bytes = await audio.read()
    with open(filepath, 'wb') as file_obj:
        file_obj.write(audio_bytes)

    if FAST_ANALYSIS_MODE:
        preprocess_result = {
            'duration_sec': 0.0,
            'speech_duration_sec': 0.0,
            'speech_ratio': 0.0,
            'num_segments': 0,
        }
        acoustic = {}
        temporal = {}
        linguistic = _fast_linguistic_fallback(transcript) if transcript.strip() else {}
    else:
        try:
            y, sr_loaded = librosa.load(io.BytesIO(audio_bytes), sr=16000, mono=True)
            sr = int(sr_loaded)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f'Failed to decode audio: {str(exc)}')

        preprocess_result = preprocess_audio(y, sr)

        acoustic = extract_all_acoustic_features(preprocess_result['y_speech'], sr)

        temporal = extract_temporal_features(
            preprocess_result['y_clean'], sr, preprocess_result['intervals']
        )
        temporal.update(
            {
                'speech_ratio': round(float(preprocess_result['speech_ratio']), 4),
                'speech_duration_sec': round(float(preprocess_result['speech_duration_sec']), 4),
                'speech_segment_count': int(preprocess_result['num_segments']),
            }
        )

        linguistic = extract_linguistic_features(transcript) if transcript.strip() else {}

    session_row = Session(
        user_id=user_id,
        session_number=session_number,
        raw_audio_path=filepath,
        transcript=transcript,
        acoustic_features=acoustic,
        temporal_features=temporal,
        linguistic_features=linguistic,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)

    baseline = compute_baseline(db, user_id)

    z_scores: dict[str, float] = {}
    drift_data: dict[str, Any] = {}
    csi_data: dict[str, Any] = {
        'csi_score': 50,
        'risk_level': 'unknown',
        'interpretation': 'Baseline not yet established. Complete more sessions.',
    }

    if baseline is not None:
        all_features: dict[str, Any] = {}
        all_features.update(acoustic)
        all_features.update(temporal)
        all_features.update(linguistic)

        z_scores = compute_z_scores(baseline, all_features)
        drift_data = compute_drift(db, user_id, z_scores)
        csi_data = compute_csi(z_scores, drift_data)

        # Smooth CSI against the previous scored session to reduce abrupt jumps.
        if last_session and last_session.csi_score is not None:
            raw_csi = int(csi_data['csi_score'])
            prev_csi = int(last_session.csi_score)
            smoothed_csi = int(round((0.50 * prev_csi) + (0.50 * raw_csi)))
            max_step = 8
            smoothed_csi = max(prev_csi - max_step, min(prev_csi + max_step, smoothed_csi))
            csi_data['raw_csi_score'] = raw_csi
            csi_data['csi_score'] = smoothed_csi

    session_row.z_scores = z_scores
    session_row.drift_scores = drift_data
    session_row.csi_score = int(csi_data['csi_score'])
    user.latest_csi_score = session_row.csi_score
    user.total_sessions = session_number
    user.last_session_at = session_row.created_at
    db.commit()

    return {
        'session_id': session_row.id,
        'session_number': session_number,
        'user_id': user_id,
        'user_latest_csi_score': user.latest_csi_score,
        'user_total_sessions': user.total_sessions,
        'preprocessing': {
            'duration_sec': preprocess_result['duration_sec'],
            'speech_duration_sec': preprocess_result['speech_duration_sec'],
            'speech_ratio': preprocess_result['speech_ratio'],
            'num_segments': preprocess_result['num_segments'],
        },
        'acoustic_features': acoustic,
        'temporal_features': temporal,
        'linguistic_features': linguistic,
        'baseline_ready': baseline is not None,
        'z_scores': z_scores,
        'drift': drift_data,
        'csi': csi_data,
        'analysis_mode': 'fast' if FAST_ANALYSIS_MODE else 'full',
    }
