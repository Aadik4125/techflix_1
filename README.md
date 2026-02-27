# CogniVara

CogniVara is a cognitive risk analysis project with:

- A static frontend (`frontend/`)
- A Node service for transcription and analysis proxy (`services/node/`)
- A Python FastAPI backend for cognitive analytics (`backend/`)

## Project Structure

```text
test_case_2/
  frontend/
    index.html
    styles/
      main.css
    scripts/
      app.js
      background.js
      api.js
      recording.js
      ui.js
      component-loader.js
    components/
      *.html
  services/
    node/
      server.js
      hf.service.js
  backend/
    main.py
    routes/
    services/
    models/
    uploads/
    requirements.txt
    cognivara.db
  tests/
    node/
      test_request.js
  docs/
    PROJECT_OVERVIEW.md
    FRONTEND_STRUCTURE.md
    reports/
      PROJECT_TECH_STACK_REPORT_v2.pdf
  tools/
    generate_pdf.py
  archive/
    frontend/
      test_1.html
      new_frontend.txt
  package.json
  package-lock.json
  pyrightconfig.json
  .env
  .env.example
```

## Run Node Service

```bash
npm install
npm start
```

- Serves frontend from `frontend/`
- Runs API endpoints at `http://localhost:3000`

## Run Python Backend

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt
python backend/main.py
```

FastAPI defaults to `http://localhost:8000`.

## Utility Commands

```bash
npm run test:node
```

Runs `tests/node/test_request.js` against the Node endpoint.
