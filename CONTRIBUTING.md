# Contributing

## Setup

Follow the development quick start in the [README](README.md). `make help` lists every task.

## Workflow

1. Branch from `main`.
2. Make focused changes with tests.
3. Run `make check` (lint, strict type checks and all tests) before pushing.
4. Open a pull request; CI must pass before merging.

## Conventions

**Backend**
- Format and lint with Ruff (`make format`); type-check with mypy in strict mode.
- Routes stay thin: domain logic belongs in `app/services/` as plain functions that are tested directly.
- Every schema change needs a migration:
  `cd backend && uv run alembic revision --autogenerate -m "describe change"`. Review the
  generated file, then run `uv run alembic check` to confirm the models and migrations agree.
- New parameters or crops: update `app/ml/features.py` or `app/data/crops.json`, retrain with
  `make train`, and commit the regenerated `app/data/crop_profiles.json`.

**Frontend**
- TypeScript strict mode; `npm run lint` must pass with no warnings.
- Server state goes through hooks in `src/lib/queries.ts`. Don't call `api` from components directly
  unless it's a one-off.
- Use the semantic colour tokens (`bg-surface`, `text-fg-muted`, `border-line`, ...) rather than raw
  Tailwind palette colours, so light and dark themes keep working.
- Keep `src/lib/types.ts` in step with the backend schemas.

## Tests

- Backend tests use SQLite by default. To run them against PostgreSQL, set
  `AGROAI_TEST_DATABASE_URL`, e.g.
  `postgresql+psycopg://agroai:agroai@localhost:5432/agroai_test`.
- Frontend tests use Vitest and Testing Library: `npm test` or `npm run test:watch`.

## Known issue

`npm audit` reports a ReDoS advisory in `picomatch`, which is used by the build tools (Vite and
Vitest) to match file paths. It has no patched release yet and is not part of the code shipped to
browsers.
