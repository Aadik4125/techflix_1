# CogniVara - Project Overview

## Summary

CogniVara processes voice recordings and transcript-derived features to estimate cognitive risk trends. The repository is organized into separated frontend, Node service, Python backend, tests, tools, docs, and archive assets.

## Architecture

- `frontend/`: static UI application
- `services/node/`: Express API for transcription and analysis flow
- `backend/`: FastAPI service for cognitive analytics, persistence, and dashboard APIs
- `tests/node/`: Node API smoke script
- `docs/`: project documentation and reports
- `tools/`: helper scripts
- `archive/`: preserved legacy frontend snapshots

## Frontend

- Entry: `frontend/index.html`
- Styling: `frontend/styles/main.css`
- Main UI logic: `frontend/scripts/app.js`
- Background animation: `frontend/scripts/background.js`
- Additional legacy frontend assets:
  - `frontend/scripts/api.js`
  - `frontend/scripts/recording.js`
  - `frontend/scripts/ui.js`
  - `frontend/scripts/component-loader.js`
  - `frontend/components/*.html`

## Node Service

- Entry: `services/node/server.js`
- HF integration: `services/node/hf.service.js`
- Serves static frontend from `frontend/`
- Main endpoints:
  - `GET /health`
  - `POST /transcribe`
  - `POST /analyze`

## Python Backend

- Entry: `backend/main.py`
- Routes:
  - `backend/routes/audio.py`
  - `backend/routes/analysis.py`
  - `backend/routes/dashboard.py`
- Services:
  - `backend/services/preprocessing.py`
  - `backend/services/acoustic_features.py`
  - `backend/services/temporal_features.py`
  - `backend/services/linguistic_features.py`
  - `backend/services/baseline.py`
  - `backend/services/drift.py`
  - `backend/services/csi.py`
- Models:
  - `backend/models/user.py`
  - `backend/models/session.py`
  - `backend/models/baseline.py`

## Data and Reports

- SQLite DB: `backend/cognivara.db`
- Audio uploads: `backend/uploads/`
- Tech stack report: `docs/reports/PROJECT_TECH_STACK_REPORT_v2.pdf`

## Run

### Node

```powershell
npm install
npm start
```

### Python

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
python backend/main.py
```

Generated on: 2026-02-27
