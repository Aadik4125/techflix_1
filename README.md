# CogniVara

CogniVara is a multi-service cognitive speech analysis project with:

- A static frontend (`frontend/`)
- A Node service for transcription and analysis proxy (`services/node/`)
- A Python FastAPI backend for cognitive analytics (`backend/`)

## Repository Status

The repository is functional and already separated by runtime concern, but it still carries some prototype-era layout decisions.

The main structural gap is that the backend currently has both:

- a legacy flat structure in `backend/routes`, `backend/services`, and `backend/models`
- a newer package-oriented structure in `backend/app/...`

For professional maintenance, treat `backend/app/` as the long-term canonical backend package and treat the flat backend folders as legacy until they are consolidated.

See [PROJECT_STRUCTURE.md](/Users/ASUS/Desktop/test_case_2/docs/PROJECT_STRUCTURE.md) for the authoritative structure guide.

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
    app/
      api/
      core/
      db/
      models/
      schemas/
      services/
      tasks/
    main.py
    routes/           # legacy flat backend layout
    services/         # legacy flat backend layout
    models/           # legacy flat backend layout
    alembic/
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

## Structure Notes

- `frontend/` contains the browser application.
- `services/node/` contains the Node.js service that serves the frontend and proxies external inference calls.
- `backend/` contains the Python backend plus migrations.
- `backend/uploads/` and `backend/cognivara.db` are local runtime artifacts and should not be treated as source code.
- `archive/` is reference material only.

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
