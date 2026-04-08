# Project Structure

This repository is organized as a multi-service application with a browser frontend, a Node.js service, and a Python backend.

## Current Assessment

The project is workable and already separated by major runtime concerns, which is a good foundation. The main structural weakness is that the backend currently contains two layouts:

- A legacy flat layout under `backend/routes`, `backend/services`, and `backend/models`
- A newer package-oriented layout under `backend/app/...`

That overlap makes the repository feel less production-grade because the canonical backend entry points are not obvious at first glance.

## Canonical Layout

Treat this structure as the professional source of truth for ongoing work:

```text
test_case_2/
  backend/
    app/
      api/        # dependency wiring and API-facing backend modules
      core/       # settings, security, monitoring
      db/         # ORM base and session management
      models/     # SQLAlchemy models
      schemas/    # request/response schemas
      services/   # domain and infrastructure services
      tasks/      # Celery/background jobs
    alembic/      # database migrations
    main.py       # backend process entry point
    requirements.txt
    Dockerfile
  frontend/
    components/   # HTML fragments
    scripts/      # browser-side logic
    styles/       # CSS
    index.html
  services/
    node/
      server.js   # Node service entry point
      hf.service.js
  docs/
    reports/      # generated reports and architecture writeups
    PROJECT_OVERVIEW.md
    FRONTEND_STRUCTURE.md
    PROJECT_STRUCTURE.md
  tests/
    node/
  tools/
  archive/        # historical snapshots only; not active app code
```

## Repository Rules

- `backend/app/` should be the long-term home for new backend code.
- `backend/routes`, `backend/services`, and `backend/models` should be treated as legacy until they are fully merged or retired.
- `backend/uploads/` and `backend/cognivara.db` are runtime artifacts, not source code.
- `archive/` is for reference only and should not be treated as active implementation.
- `docs/reports/` is acceptable for generated reports, but those reports should not define the runtime structure.

## What Already Looks Professional

- Clear separation between frontend, backend, and service layers
- Dedicated `docs/`, `tests/`, and `tools/` directories
- Environment files separated from source code
- Presence of migration infrastructure under `backend/alembic`

## What Still Needs Attention

These are the next structural changes I would recommend, but they should be done carefully because they affect imports and runtime wiring:

1. Consolidate backend code so only one layout remains authoritative.
2. Move all backend runtime storage into a dedicated non-source path such as `backend/data/` or `var/`.
3. Add separate test areas for backend Python code and frontend/browser code if those expand.
4. Rename legacy or temporary prototype labels that still appear in metadata.

## Efficiency Verdict

Current folder structure efficiency: good, but not yet fully professional.

- Organization by runtime area: strong
- Source-of-truth clarity: moderate
- Runtime artifact isolation: moderate
- Maintainability for a growing team: moderate

Overall, the repository is closer to a solid prototype than a polished production-grade workspace. With the hygiene changes in this pass, it is cleaner and safer. The one major remaining gap is backend consolidation.
