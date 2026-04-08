# CogniVara Technical Stack and Pipeline Architecture Report

Generated on: 2026-03-30

## Executive Summary

CogniVara is a voice-based cognitive risk analysis platform built as a multi-service web application. It combines a static browser frontend, a Node.js service for transcription and lightweight text analysis integration, and a Python FastAPI backend for feature extraction, persistence, longitudinal analysis, and dashboard APIs.

The system is designed around short user voice recordings. Audio and transcript data move through a staged pipeline that supports user onboarding, speech capture, transcription, feature extraction, personal baseline modeling, drift detection, composite score generation, and dashboard visualization.

The current implementation is primarily rules- and signal-based rather than fully ML-driven for final scoring. However, the architecture already provides a clean separation between capture, analytics, storage, and presentation, which makes future replacement of the scoring layer with a trained machine learning model feasible.

## 1. Solution Overview

CogniVara is organized into three main runtime layers:

1. Frontend web application
2. Node.js service
3. Python analytics backend

These layers work together as follows:

```text
Browser UI
  -> records audio and captures live transcript when available
  -> sends transcript/audio to backend services

Node.js service
  -> serves the frontend
  -> calls Hugging Face for transcription
  -> provides fallback heuristic text analysis

FastAPI backend
  -> stores users and sessions
  -> extracts audio/text features
  -> computes baseline, z-scores, drift, and CSI
  -> exposes dashboard and history APIs
```

## 2. Technology Stack

### 2.1 Frontend

Primary technologies:

- HTML5 for page structure
- CSS3 for styling
- Vanilla JavaScript for application logic
- Three.js for animated visual background
- Browser media APIs for recording and live transcript support

Key frontend files:

- [frontend/index.html](/Users/ASUS/Desktop/test_case_2/frontend/index.html)
- [frontend/styles/main.css](/Users/ASUS/Desktop/test_case_2/frontend/styles/main.css)
- [frontend/scripts/app.js](/Users/ASUS/Desktop/test_case_2/frontend/scripts/app.js)
- [frontend/scripts/background.js](/Users/ASUS/Desktop/test_case_2/frontend/scripts/background.js)

Frontend responsibilities:

- User signup and session initiation
- Microphone access and recording control
- Live transcript rendering during recording
- Upload of per-session audio and transcript
- Dashboard and comparison view rendering
- Backend connectivity checks and graceful fallback handling

Browser capabilities used in the frontend:

- `MediaRecorder` for raw audio capture
- `getUserMedia()` for microphone access
- `SpeechRecognition` / `webkitSpeechRecognition` when available
- `fetch()` for API communication
- `localStorage` for user session persistence

### 2.2 Node.js Service

Primary technologies:

- Node.js runtime
- Express.js web server
- Multer for multipart file upload parsing
- Axios for HTTP calls to external inference APIs
- dotenv for environment variable loading
- CORS middleware

Key files:

- [services/node/server.js](/Users/ASUS/Desktop/test_case_2/services/node/server.js)
- [services/node/hf.service.js](/Users/ASUS/Desktop/test_case_2/services/node/hf.service.js)
- [package.json](/Users/ASUS/Desktop/test_case_2/package.json)

Node service responsibilities:

- Serves the static frontend assets
- Provides `/transcribe` endpoint for speech-to-text
- Provides `/analyze` endpoint for text-based emotion and sentiment analysis
- Integrates with Hugging Face inference endpoints
- Falls back to local heuristic behavior when no API key is configured

### 2.3 Python Backend

Primary technologies:

- Python
- FastAPI for REST APIs
- SQLAlchemy ORM for data access
- SQLite by default, PostgreSQL-compatible through configuration
- Alembic for schema evolution
- librosa, numpy, scipy for audio and numerical processing
- NLTK for transcript-derived linguistic features
- python-dotenv for configuration

Key files:

- [backend/main.py](/Users/ASUS/Desktop/test_case_2/backend/main.py)
- [backend/routes/audio.py](/Users/ASUS/Desktop/test_case_2/backend/routes/audio.py)
- [backend/routes/analysis.py](/Users/ASUS/Desktop/test_case_2/backend/routes/analysis.py)
- [backend/routes/dashboard.py](/Users/ASUS/Desktop/test_case_2/backend/routes/dashboard.py)
- [backend/database.py](/Users/ASUS/Desktop/test_case_2/backend/database.py)

Core backend service modules:

- [backend/services/preprocessing.py](/Users/ASUS/Desktop/test_case_2/backend/services/preprocessing.py)
- [backend/services/acoustic_features.py](/Users/ASUS/Desktop/test_case_2/backend/services/acoustic_features.py)
- [backend/services/temporal_features.py](/Users/ASUS/Desktop/test_case_2/backend/services/temporal_features.py)
- [backend/services/linguistic_features.py](/Users/ASUS/Desktop/test_case_2/backend/services/linguistic_features.py)
- [backend/services/baseline.py](/Users/ASUS/Desktop/test_case_2/backend/services/baseline.py)
- [backend/services/drift.py](/Users/ASUS/Desktop/test_case_2/backend/services/drift.py)
- [backend/services/csi.py](/Users/ASUS/Desktop/test_case_2/backend/services/csi.py)

Backend responsibilities:

- User and session persistence
- Audio file storage
- Speech feature extraction
- Transcript feature extraction
- Longitudinal personal baseline computation
- Drift detection across sessions
- Composite score generation
- Dashboard and trend aggregation

### 2.4 Data Layer

Database technologies:

- SQLite for local development
- PostgreSQL-compatible configuration for deployment

Main persisted entities:

- [backend/models/user.py](/Users/ASUS/Desktop/test_case_2/backend/models/user.py)
- [backend/models/session.py](/Users/ASUS/Desktop/test_case_2/backend/models/session.py)
- [backend/models/baseline.py](/Users/ASUS/Desktop/test_case_2/backend/models/baseline.py)

Stored data includes:

- User profile metadata
- Session transcript
- Raw audio file path
- Acoustic feature JSON
- Temporal feature JSON
- Linguistic feature JSON
- Z-score JSON
- Drift JSON
- CSI score

## 3. End-to-End Pipeline Architecture

The operational pipeline is divided into capture, enrichment, analytics, persistence, and presentation stages.

### 3.1 Stage 1: User Access and Initialization

The user opens the frontend served either as static assets or through the Node service. The frontend initializes the visual interface, checks backend health, and loads local user data if previously stored.

Main components involved:

- Browser
- [frontend/scripts/app.js](/Users/ASUS/Desktop/test_case_2/frontend/scripts/app.js)
- `GET /api/health`
- `GET /health`

### 3.2 Stage 2: Recording and Live Transcript

During recording:

- The browser requests microphone access.
- `MediaRecorder` captures the audio stream.
- Browser speech recognition attempts to generate an in-session live transcript when supported.
- The transcript panel updates as the user speaks.

This stage is implemented mainly in:

- [frontend/scripts/app.js](/Users/ASUS/Desktop/test_case_2/frontend/scripts/app.js)

### 3.3 Stage 3: Session Upload

When a recording stops, the frontend packages the captured blob and the current transcript and sends them to the FastAPI backend via:

- `POST /api/upload`

If transcript text is incomplete or unavailable:

- The frontend may still upload the audio
- The Node service may be queried separately through `/transcribe`
- The UI falls back gracefully to pending or unavailable transcript states

### 3.4 Stage 4: Audio and Text Feature Extraction

Inside the Python backend upload route:

1. Audio is saved to disk in `backend/uploads/`
2. A session record is created
3. Feature extraction begins

Two backend modes exist:

- Fast analysis mode
  - Uses lightweight text heuristics
  - Skips heavy acoustic processing
- Full analysis mode
  - Decodes audio with `librosa`
  - Runs preprocessing
  - Extracts acoustic features
  - Extracts temporal features
  - Extracts linguistic features from transcript

Pipeline entry point:

- [audio.py](/Users/ASUS/Desktop/test_case_2/backend/routes/audio.py)

### 3.5 Stage 5: Baseline Modeling

After enough sessions are present, the backend computes a personal baseline using the earliest configured baseline window.

Baseline logic:

- The first `N` sessions are collected
- Tracked features are merged into a flat feature matrix
- Mean and standard deviation are computed for each feature
- Baseline statistics are stored for reuse

This is implemented in:

- [baseline.py](/Users/ASUS/Desktop/test_case_2/backend/services/baseline.py)

This is a personalized baseline architecture rather than a population-trained risk model.

### 3.6 Stage 6: Z-Score Transformation

For a new session, current feature values are compared to baseline statistics:

- Per-feature deviation from baseline is computed
- Standard deviation floors reduce instability
- Values are clipped and regularized

This produces normalized z-scores used by later stages.

### 3.7 Stage 7: Drift Detection

The backend then evaluates temporal change over recent sessions:

- Rolling averages across recent z-score histories
- Linear trend slopes
- Feature-level deviation flags
- Overall drift score

This allows the platform to assess whether changes are isolated or sustained over time.

Implementation:

- [drift.py](/Users/ASUS/Desktop/test_case_2/backend/services/drift.py)

### 3.8 Stage 8: CSI Score Generation

The current scoring layer computes a Composite Cognitive Stability Index (CSI):

- Selected z-score components are normalized
- Weighted aggregation is applied
- Drift-based penalties are optionally added
- Final score is mapped to a 0-100 range
- Risk interpretation text is generated

Implementation:

- [csi.py](/Users/ASUS/Desktop/test_case_2/backend/services/csi.py)

Important architectural note:

The current CSI is not generated by a trained predictive ML model. It is a deterministic signal-processing and rules-based score built from extracted features and longitudinal drift.

### 3.9 Stage 9: Persistence

The backend stores:

- Session-level feature JSON
- Z-scores
- Drift results
- Final CSI score
- User summary fields such as latest score and total sessions

Persistence components:

- [database.py](/Users/ASUS/Desktop/test_case_2/backend/database.py)
- [session.py](/Users/ASUS/Desktop/test_case_2/backend/models/session.py)
- [user.py](/Users/ASUS/Desktop/test_case_2/backend/models/user.py)
- [baseline.py](/Users/ASUS/Desktop/test_case_2/backend/models/baseline.py)

### 3.10 Stage 10: Dashboard and Reporting APIs

The frontend renders user-facing analytics by calling:

- `GET /api/dashboard/{user_id}`
- `GET /api/baseline/{user_id}`

These endpoints aggregate:

- Latest score
- Feature summaries
- Longitudinal score trends
- Baseline readiness
- Flagged features

Implementation:

- [dashboard.py](/Users/ASUS/Desktop/test_case_2/backend/routes/dashboard.py)

## 4. Detailed Request Flow

The practical runtime request flow is:

```text
1. User opens frontend
2. Frontend checks backend health
3. User signs up or resumes local session
4. Browser records audio
5. Browser generates live transcript when supported
6. Frontend uploads audio + transcript to FastAPI
7. FastAPI stores recording and extracts features
8. FastAPI computes baseline, z-scores, drift, and CSI
9. FastAPI stores analytics output
10. Frontend requests dashboard summary
11. Dashboard visualizes trends and risk status
```

Optional side flow:

```text
Frontend -> Node /transcribe -> Hugging Face Whisper -> transcript returned
Frontend -> Node /analyze -> Hugging Face classifiers -> parsed emotion/sentiment signals
```

## 5. Current Scoring Architecture

The current scoring architecture is hybrid, not purely AI-model-based.

### Production-style backend score

The principal score shown in the backend analytics flow is:

- CSI
- Derived from extracted features
- Based on personalized baseline comparison
- Adjusted using drift logic

This is implemented in Python and persisted in the database.

### Auxiliary or fallback scoring paths

The repository also contains:

- Hugging Face text-signal analysis in the Node service
- Local heuristic fallback analysis in the frontend
- Hardcoded reference patient comparison data for demo-style comparison views

Therefore, the system contains both real processing logic and presentation/demo scaffolding.

## 6. Deployment and Runtime Characteristics

### Local development

- Frontend + Node service typically run on `localhost:3000`
- FastAPI backend typically runs on `localhost:8000`
- SQLite is used by default

### Environment configuration

Configuration is driven primarily through:

- `.env`
- [backend/config.py](/Users/ASUS/Desktop/test_case_2/backend/config.py)
- [services/node/server.js](/Users/ASUS/Desktop/test_case_2/services/node/server.js)

### Performance-related design choices

The codebase includes:

- Fast analysis mode to reduce heavy audio processing time
- Graceful fallback when external APIs are unavailable
- Background transcription behavior in the frontend
- Smoothed CSI transitions between sessions

## 7. Strengths of the Current Architecture

- Clear separation between UI, external inference integration, and analytics backend
- Practical longitudinal analysis design based on personal baselines
- Database-backed session history and dashboard APIs
- Fallback behavior for offline or missing external AI services
- Straightforward extension point for future ML scoring replacement

## 8. Constraints and Technical Gaps

- Final cognitive score is currently rule-based rather than ML-model-driven
- Frontend still contains some demo-oriented reference data
- Node and Python analytics responsibilities overlap conceptually in a few places
- Fast mode trades acoustic richness for responsiveness
- The project does not yet expose a trained model lifecycle for versioned inference

## 9. Recommended Next Technical Evolution

To mature the platform into a more production-grade analytics system, the next improvements should be:

1. Replace the CSI formula with a trained ML scoring model
2. Version model artifacts explicitly in the backend
3. Standardize one authoritative scoring path
4. Add evaluation metrics and validation reporting
5. Introduce report-generation templates for clinical or stakeholder export

## 10. Conclusion

CogniVara is a well-structured prototype with a layered architecture suitable for iterative evolution. It already supports a realistic flow for recording, transcript capture, feature extraction, personalized baseline modeling, drift monitoring, and dashboard presentation.

From a technical perspective, the platform is best described as a multi-service cognitive speech analytics application that uses:

- browser-based media capture
- Node.js for external inference integration
- FastAPI for analytics and persistence
- SQLAlchemy-backed storage
- deterministic longitudinal scoring

Its architecture is strong enough to support the next step of transitioning from rule-based CSI generation to a trained machine learning scoring model without requiring a full system rewrite.
