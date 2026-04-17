
from __future__ import annotations

import io
import os
import uuid
import hashlib
import re
from typing import Any

import librosa
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from sqlalchemy.orm import Session as DBSession

from config import AUDIO_UPLOAD_DIR, FAST_ANALYSIS_MODE
from database import get_db, SessionLocal
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

# runtime flag copied from config for easier use in handlers
fast_mode = bool(FAST_ANALYSIS_MODE)


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
    negative_set = {
        'sad', 'angry', 'upset', 'worried', 'worry', 'stress', 'stressed', 'stressful',
        'tired', 'exhausted', 'drained', 'fatigued', 'confused', 'hard', 'difficult',
        'bad', 'terrible', 'awful', 'anxious', 'anxiety', 'panic', 'scared', 'afraid',
        'low', 'down', 'depressed', 'hopeless', 'overwhelmed', 'frustrated', 'irritated',
        'nervous', 'unwell', 'sick', 'pain', 'pressure', 'struggle', 'struggling',
    }
    positive_set = {
        'happy', 'good', 'great', 'calm', 'fine', 'better', 'excited', 'relaxed',
        'nice', 'easy', 'okay', 'ok', 'well', 'focused', 'stable', 'confident',
        'peaceful', 'positive', 'energetic', 'rested',
    }
    negators = {'not', "n't", 'no', 'never', 'hardly', 'barely', 'without'}
    intensifiers = {'very', 'really', 'so', 'too', 'extremely', 'quite', 'still'}
    filler_count = sum(1 for w in words if w in filler_set)
    lexical_diversity = (unique_count / word_count) if word_count else 0.0
    filler_ratio = (filler_count / word_count) if word_count else 0.0
    sentence_count = max(1, text.count('.') + text.count('!') + text.count('?')) if text else 0
    sentence_length_mean = (word_count / sentence_count) if sentence_count else 0.0

    positive_score = 0.0
    negative_score = 0.0
    for idx, word in enumerate(words):
        context = words[max(0, idx - 3):idx]
        is_negated = any(w in negators for w in context)
        intensity = 1.35 if any(w in intensifiers for w in context) else 1.0
        if word in negative_set:
            if is_negated:
                positive_score += 0.75 * intensity
            else:
                negative_score += 1.0 * intensity
        if word in positive_set:
            if is_negated:
                negative_score += 1.0 * intensity
            else:
                positive_score += 1.0 * intensity

    tone_risk = max(
        0.0,
        min(
            100.0,
            38.0 + (negative_score * 16.0) - (positive_score * 7.0) + (max(0, 10 - word_count) * 0.8),
        ),
    )
    if negative_score > 0 and negative_score >= positive_score:
        tone_label = 'strained'
    elif positive_score >= negative_score + 1:
        tone_label = 'positive'
    else:
        tone_label = 'neutral'

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
        'positive_word_score': round(float(positive_score), 4),
        'negative_word_score': round(float(negative_score), 4),
        'sentiment_balance': round(float(positive_score - negative_score), 4),
        'tone_risk': round(float(tone_risk), 4),
        'tone_label': tone_label,
    }


def _rms_intervals(y: np.ndarray, frame_length: int, hop_length: int, threshold: float) -> list[tuple[int, int]]:
    rms = np.asarray(
        librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0],
        dtype=float,
    )
    if rms.size == 0:
        return []

    active = rms > threshold
    intervals: list[tuple[int, int]] = []
    start: int | None = None
    for idx, is_active in enumerate(active):
        if is_active and start is None:
            start = idx
        elif not is_active and start is not None:
            intervals.append((start * hop_length, min(len(y), idx * hop_length + frame_length)))
            start = None
    if start is not None:
        intervals.append((start * hop_length, len(y)))
    return intervals


def _quick_actual_features(audio_bytes: bytes, transcript: str) -> tuple[dict[str, float], dict[str, float], dict[str, float], dict[str, float]]:
    """Compute real, low-cost features for the fast response path."""
    y, sr_loaded = librosa.load(io.BytesIO(audio_bytes), sr=8000, mono=True)
    sr = int(sr_loaded)
    if y.size == 0:
        raise ValueError('Uploaded audio is empty')

    max_samples = sr * 35
    if y.size > max_samples:
        y = y[:max_samples]

    y = np.asarray(y, dtype=np.float32)
    duration_sec = float(len(y)) / sr
    frame_length = 512
    hop_length = 256

    rms = np.asarray(
        librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0],
        dtype=float,
    )
    rms_mean = float(np.mean(rms)) if rms.size else 0.0
    rms_var = float(np.var(rms)) if rms.size else 0.0
    threshold = max(float(np.percentile(rms, 60)) * 0.55, rms_mean * 0.35, 1e-5) if rms.size else 1e-5
    intervals = _rms_intervals(y, frame_length, hop_length, threshold)
    speech_samples = sum(max(0, end - start) for start, end in intervals)
    speech_duration_sec = float(speech_samples) / sr
    speech_ratio = speech_duration_sec / duration_sec if duration_sec else 0.0

    if rms.size:
        active_frames = int(np.count_nonzero(rms > threshold))
        speech_rate = (active_frames / max(rms.size, 1)) * 4.0
    else:
        speech_rate = 0.0

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=8, n_fft=512, hop_length=hop_length)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=512, hop_length=hop_length)[0]

    pitches = librosa.yin(
        y,
        fmin=75,
        fmax=400,
        sr=sr,
        frame_length=1024,
        hop_length=hop_length,
    )
    pitches = np.asarray(pitches, dtype=float)
    valid_pitch = pitches[np.isfinite(pitches) & (pitches > 0)]
    pitch_diffs = np.abs(np.diff(valid_pitch)) if valid_pitch.size > 1 else np.array([], dtype=float)
    rms_diffs = np.abs(np.diff(rms)) if rms.size > 1 else np.array([], dtype=float)

    pauses: list[float] = []
    if intervals:
        first_start = intervals[0][0]
        if first_start > 0:
            pauses.append(first_start / sr)
        for (_, previous_end), (next_start, _) in zip(intervals, intervals[1:]):
            gap = max(0, next_start - previous_end) / sr
            if gap >= 0.12:
                pauses.append(gap)

    words = re.findall(r"[a-zA-Z']+", transcript or '')
    word_count = len(words)
    acoustic = {
        'mfcc_variance_avg': round(float(np.mean(np.var(mfcc, axis=1))), 4),
        'pitch_mean': round(float(np.mean(valid_pitch)), 4) if valid_pitch.size else 0.0,
        'pitch_var': round(float(np.var(valid_pitch)), 4) if valid_pitch.size else 0.0,
        'pitch_range': round(float(np.ptp(valid_pitch)), 4) if valid_pitch.size else 0.0,
        'voiced_fraction': round(float(valid_pitch.size / max(len(pitches), 1)), 4),
        'jitter_local': round(float(np.mean(pitch_diffs) / (np.mean(valid_pitch) + 1e-6)), 4) if pitch_diffs.size and valid_pitch.size else 0.0,
        'shimmer_local': round(float(np.mean(rms_diffs) / (rms_mean + 1e-6)), 4) if rms_diffs.size else 0.0,
        'spectral_centroid_mean': round(float(np.mean(centroid)), 4) if centroid.size else 0.0,
        'spectral_centroid_var': round(float(np.var(centroid)), 4) if centroid.size else 0.0,
        'energy_mean': round(rms_mean, 6),
        'energy_var': round(rms_var, 6),
        'speech_rate': round(float(word_count / max(speech_duration_sec, 1.0)), 4) if word_count else round(speech_rate, 4),
        'duration_sec': round(duration_sec, 4),
    }
    temporal = {
        'response_latency': round(float(pauses[0]), 4) if pauses else 0.0,
        'rhythm_consistency': round(float(1.0 / (1.0 + np.std(rms))), 4) if rms.size else 0.0,
        'pause_variability': round(float(np.std(pauses)), 4) if pauses else 0.0,
        'speed_variability': round(float(np.std(rms) / (rms_mean + 1e-6)), 4) if rms.size else 0.0,
        'mean_pause_duration': round(float(np.mean(pauses)), 4) if pauses else 0.0,
        'max_pause_duration': round(float(np.max(pauses)), 4) if pauses else 0.0,
        'pause_count': float(len(pauses)),
        'speech_ratio': round(float(speech_ratio), 4),
        'speech_duration_sec': round(float(speech_duration_sec), 4),
        'speech_segment_count': float(len(intervals)),
    }
    linguistic = _fast_linguistic_fallback(transcript)
    preprocess_result = {
        'duration_sec': round(duration_sec, 4),
        'speech_duration_sec': round(float(speech_duration_sec), 4),
        'speech_ratio': round(float(speech_ratio), 4),
        'num_segments': len(intervals),
    }
    return acoustic, temporal, linguistic, preprocess_result


def _tone_adjusted_csi(csi_data: dict[str, Any], linguistic: dict[str, Any]) -> dict[str, Any]:
    """Lower CSI when transcript tone clearly indicates stress or negative affect."""
    if not isinstance(csi_data, dict) or not isinstance(linguistic, dict):
        return csi_data

    tone_risk = float(linguistic.get('tone_risk') or 0.0)
    tone_label = str(linguistic.get('tone_label') or '').lower()
    negative_score = float(linguistic.get('negative_word_score') or 0.0)
    positive_score = float(linguistic.get('positive_word_score') or 0.0)
    word_count = int(float(linguistic.get('word_count') or 0))

    if word_count < 3 or tone_risk < 45 or tone_label != 'strained':
        return csi_data

    current_csi = int(csi_data.get('csi_score', 50))
    confidence = max(0.35, min(1.0, word_count / 24.0))

    if tone_risk >= 65 or negative_score >= positive_score + 1.0:
        target_csi = 37 + int(round((1.0 - confidence) * 4.0))
    elif tone_risk >= 55:
        target_csi = 41 + int(round((1.0 - confidence) * 4.0))
    else:
        target_csi = 45

    adjusted_csi = min(current_csi, max(37, min(45, target_csi)))
    if adjusted_csi == current_csi:
        return csi_data

    adjusted = dict(csi_data)
    adjusted['pre_tone_csi_score'] = current_csi
    adjusted['csi_score'] = adjusted_csi
    adjusted['tone_adjustment'] = {
        'tone_label': tone_label,
        'tone_risk': round(tone_risk, 4),
        'negative_word_score': round(negative_score, 4),
        'positive_word_score': round(positive_score, 4),
        'target_csi': target_csi,
    }
    adjusted['risk_level'] = 'high' if adjusted_csi < 45 else 'moderate'
    adjusted['interpretation'] = (
        f"Transcript tone indicated elevated stress ({tone_label}, tone risk {round(tone_risk)}), "
        "so CSI was calibrated downward from the biomarker-only score."
    )
    return adjusted


def _spoken_content_interpretation(
    transcript: str,
    csi_data: dict[str, Any],
    session_number: int,
) -> str:
    text = (transcript or '').strip()
    if not text:
        return (
            f'Session {session_number}: no transcript text was available, so this interpretation is based on '
            'audio-derived biomarkers and CSI drift only.'
        )

    words = re.findall(r"[a-zA-Z']+", text.lower())
    word_count = len(words)
    sentence_count = max(1, len([s for s in re.split(r'[.!?]+', text) if s.strip()]))
    unique_count = len(set(words))
    filler_words = {'um', 'uh', 'like', 'actually', 'basically', 'so', 'well', 'right'}
    stop_words = {
        'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from',
        'had', 'has', 'have', 'he', 'her', 'his', 'i', 'in', 'is', 'it', 'its', 'me',
        'my', 'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their', 'them', 'then',
        'there', 'they', 'this', 'to', 'was', 'we', 'were', 'with', 'you', 'your',
        'about', 'just', 'really', 'today',
    }
    filler_count = sum(1 for word in words if word in filler_words)
    repeat_count = sum(1 for idx, word in enumerate(words[1:], 1) if word == words[idx - 1])
    lexical_diversity = unique_count / word_count if word_count else 0.0
    avg_sentence_len = word_count / sentence_count if sentence_count else 0.0

    keyword_counts: dict[str, int] = {}
    for word in words:
        if len(word) < 4 or word in stop_words or word in filler_words:
            continue
        keyword_counts[word] = keyword_counts.get(word, 0) + 1
    keywords = [
        word
        for word, _ in sorted(keyword_counts.items(), key=lambda item: (-item[1], item[0]))[:4]
    ]

    first_sentence = next((s.strip() for s in re.split(r'[.!?]+', text) if s.strip()), text)
    quote = first_sentence[:117] + '...' if len(first_sentence) > 120 else first_sentence

    if word_count < 12:
        structure = 'The response was short, so content confidence is limited.'
    elif lexical_diversity >= 0.72 and avg_sentence_len >= 8:
        structure = 'Vocabulary variety and sentence length support a more confident content read.'
    elif lexical_diversity < 0.48:
        structure = 'Vocabulary variety was limited, which can lower the linguistic complexity estimate.'
    else:
        structure = 'Sentence structure was understandable with moderate vocabulary variety.'

    if filler_count / max(word_count, 1) >= 0.08:
        fluency = f'Fillers were relatively frequent ({filler_count}/{word_count} words), suggesting hesitation pressure.'
    elif repeat_count / max(word_count, 1) >= 0.05:
        fluency = f'Immediate word repetition appeared {repeat_count} time(s), suggesting some restart behavior.'
    else:
        fluency = 'Filler and immediate repetition levels were low.'

    topic_text = ', '.join(keywords) if keywords else 'too sparse to identify reliably'
    score = csi_data.get('csi_score', 50)
    risk = csi_data.get('risk_level', 'unknown')
    return (
        f'Session {session_number}: based on what was said - "{quote}". '
        f'Main spoken themes: {topic_text}. {structure} {fluency} '
        f'CSI {score}/100, risk level {risk}.'
    )

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


@router.post('/upload', response_model=None)
async def upload_and_analyze(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(...),
    user_id: int = Form(...),
    transcript: str = Form(''),
    quick: bool = Form(False),
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

    # Initialize defaults
    acoustic, temporal, linguistic = {}, {}, {}
    preprocess_result = {'duration_sec': 0, 'speech_duration_sec': 0, 'speech_ratio': 0, 'num_segments': 0}

    use_quick_analysis = fast_mode or quick

    try:
        if use_quick_analysis:
            acoustic, temporal, linguistic, preprocess_result = _quick_actual_features(audio_bytes, transcript)
        else:
            y, sr_loaded = librosa.load(io.BytesIO(audio_bytes), sr=16000, mono=True)
            sr = int(sr_loaded)
            preprocess_result = preprocess_audio(y, sr)
            acoustic = extract_all_acoustic_features(preprocess_result['y_speech'], sr)
            temporal = extract_temporal_features(preprocess_result['y_clean'], sr, preprocess_result['intervals'])
            temporal.update({
                'speech_ratio': round(float(preprocess_result['speech_ratio']), 4),
                'speech_duration_sec': round(float(preprocess_result['speech_duration_sec']), 4),
                'speech_segment_count': int(preprocess_result['num_segments']),
            })
            linguistic = extract_linguistic_features(transcript) if transcript.strip() else {}
            linguistic.update(_fast_linguistic_fallback(transcript))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'Failed to decode audio: {str(exc)}')

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
        csi_data = _tone_adjusted_csi(csi_data, linguistic)

        # Smooth CSI against the previous scored session to reduce abrupt jumps.
        if last_session and last_session.csi_score is not None and 'tone_adjustment' not in csi_data:
            raw_csi = int(csi_data['csi_score'])
            prev_csi = int(last_session.csi_score)
            smoothed_csi = int(round((0.50 * prev_csi) + (0.50 * raw_csi)))
            max_step = 8
            smoothed_csi = max(prev_csi - max_step, min(prev_csi + max_step, smoothed_csi))
            csi_data['raw_csi_score'] = raw_csi
            csi_data['csi_score'] = smoothed_csi

    biomarker_interpretation = csi_data.get('interpretation', '')
    content_interpretation = _spoken_content_interpretation(transcript, csi_data, session_number)
    csi_data['biomarker_interpretation'] = biomarker_interpretation
    csi_data['interpretation'] = content_interpretation

    session_row.z_scores = z_scores
    session_row.drift_scores = drift_data
    session_row.csi_score = int(csi_data['csi_score'])
    user.latest_csi_score = session_row.csi_score
    user.total_sessions = session_number
    user.last_session_at = session_row.created_at
    db.commit()

    # Fast/quick responses already include actual signal-derived features. Only
    # run the heavier refinement when the caller did not explicitly ask for quick.
    if use_quick_analysis and not quick and background_tasks is not None:
        # Run full analysis asynchronously to avoid blocking the request.
        background_tasks.add_task(_run_full_analysis_background, session_row.id, filepath, transcript, user_id)

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
        'analysis_mode': 'quick_actual' if use_quick_analysis else 'full',
    }


def _run_full_analysis_background(session_id: int, filepath: str, transcript: str, user_id: int) -> None:
    """Background worker to perform full analysis and update the session + user records.

    This uses a new DB session because BackgroundTasks run outside the request scope.
    """
    db = SessionLocal()
    try:
        session_row = db.query(Session).filter(Session.id == session_id).first()
        if not session_row:
            return

        # load audio bytes
        try:
            with open(filepath, 'rb') as fh:
                audio_bytes = fh.read()
        except Exception:
            audio_bytes = b''

        if not audio_bytes:
            return

        try:
            y, sr_loaded = librosa.load(io.BytesIO(audio_bytes), sr=16000, mono=True)
            sr = int(sr_loaded)
        except Exception:
            return

        preprocess_result = preprocess_audio(y, sr)

        acoustic = extract_all_acoustic_features(preprocess_result['y_speech'], sr)

        temporal = extract_temporal_features(preprocess_result['y_clean'], sr, preprocess_result['intervals'])
        temporal.update(
            {
                'speech_ratio': round(float(preprocess_result['speech_ratio']), 4),
                'speech_duration_sec': round(float(preprocess_result['speech_duration_sec']), 4),
                'speech_segment_count': int(preprocess_result['num_segments']),
            }
        )

        linguistic = extract_linguistic_features(transcript) if transcript.strip() else {}
        linguistic.update(_fast_linguistic_fallback(transcript))

        # Save full features back to session_row
        session_row.acoustic_features = acoustic
        session_row.temporal_features = temporal
        session_row.linguistic_features = linguistic
        db.add(session_row)
        db.commit()
        db.refresh(session_row)

        # Recompute baseline, z-scores, drift, and CSI
        baseline = compute_baseline(db, user_id)
        z_scores = {}
        drift_data = {}
        csi_data = {
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
            csi_data = _tone_adjusted_csi(csi_data, linguistic)

            # Smooth CSI against the previous scored session to reduce abrupt jumps.
            last_session = (
                db.query(Session)
                .filter(Session.user_id == user_id)
                .order_by(Session.session_number.desc())
                .first()
            )
            if last_session and last_session.csi_score is not None and 'tone_adjustment' not in csi_data:
                raw_csi = int(csi_data['csi_score'])
                prev_csi = int(last_session.csi_score)
                smoothed_csi = int(round((0.50 * prev_csi) + (0.50 * raw_csi)))
                max_step = 8
                smoothed_csi = max(prev_csi - max_step, min(prev_csi + max_step, smoothed_csi))
                csi_data['raw_csi_score'] = raw_csi
                csi_data['csi_score'] = smoothed_csi

        biomarker_interpretation = csi_data.get('interpretation', '')
        content_interpretation = _spoken_content_interpretation(
            transcript,
            csi_data,
            int(session_row.session_number),
        )
        csi_data['biomarker_interpretation'] = biomarker_interpretation
        csi_data['content_interpretation'] = content_interpretation
        csi_data['interpretation'] = content_interpretation

        session_row.z_scores = z_scores
        session_row.drift_scores = drift_data
        session_row.csi_score = int(csi_data['csi_score'])

        # Update user
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.latest_csi_score = session_row.csi_score
            user.total_sessions = session_row.session_number
            user.last_session_at = session_row.created_at
            db.add(user)

        db.add(session_row)
        db.commit()
    finally:
        db.close()

@router.get('/all-transcripts')
def get_all_transcripts(db: DBSession = Depends(get_db)) -> list[dict[str, Any]]:
    """Retrieve all transcripts stored in the system across all users and sessions."""
    sessions = db.query(Session).order_by(Session.id.desc()).all()
    return [
        {
            'session_id': s.id,
            'user_id': s.user_id,
            'session_number': s.session_number,
            'transcript': s.transcript,
            'created_at': s.created_at.isoformat() if s.created_at else None
        }
        for s in sessions
    ]
