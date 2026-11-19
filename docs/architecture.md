# Architecture

## Overview

```
 Browser ──► nginx (web container) ──┬── static React app (/)
                                     └── /api, /health ──► FastAPI (api container) ──► PostgreSQL
                                                              │
                                                              ├── ML model (joblib artifact, loaded at startup)
                                                              └── crop catalogue + profiles (JSON, read once)
```

- **Frontend:** React 19 + TypeScript, built by Vite and served by nginx. React Router handles
  navigation, TanStack Query handles server state and caching, react-hook-form + Zod handle form
  validation, MapLibre GL draws maps (loaded only when a map is on screen) and Recharts draws
  charts. Styling is Tailwind CSS with semantic
  colour tokens, and light and dark themes follow the operating-system setting.
- **Backend:** FastAPI on Python 3.12+, SQLAlchemy 2 (synchronous), Alembic migrations,
  Pydantic v2 settings and schemas.
- **Same-origin deployment.** nginx proxies `/api` to the backend, so production needs no CORS
  and the bearer token never crosses origins. In development, Vite's proxy does the same.

## Backend layers

| Layer | Location | Responsibility |
|---|---|---|
| Routes | `app/api/routes/` | HTTP concerns: parsing, auth, status codes, ownership checks |
| Presenters | `app/api/presenters.py` | Turn ORM rows and service results into response schemas |
| Services | `app/services/` | Domain logic with no HTTP or database knowledge: advisory engine, growth stages, simulator, crop catalogue |
| ML | `app/ml/` | Feature definitions (single source of truth), dataset validation, training, prediction |
| Persistence | `app/models/`, `app/db/` | SQLAlchemy models, UTC-safe timestamps, session factory |

Services are pure functions over plain data, so they are unit-tested without a database or HTTP
client.

## Data model

```
users 1──* notifications            (WhatsApp alerts sent, one row per milestone)
  │
users 1──* fields 1──* sensor_readings
  │           ├──* crop_cycles
  │           ├──* weather_days        (daily history from Open-Meteo)
  │           └──* devices 1──* telemetry
  └──* recommendations *──0..1 fields   (SET NULL when a field is deleted)
```

- All primary keys are UUIDs; all timestamps are timezone-aware UTC.
- Deleting a user cascades to everything they own; deleting a field keeps its recommendations
  in history.
- `sensor_readings (field_id, recorded_at)` and `recommendations (user_id, created_at)` are indexed
  for the app's main time-ordered queries.
- Check constraints guard coordinates, areas, yields and harvest dates at the database level as
  well as in the API.

## Security

- Passwords are hashed with bcrypt. Login takes the same time for unknown emails as for wrong
  passwords, and returns an identical error, so accounts can't be enumerated.
- Stateless JWT access tokens (HS256, 60-minute default) carry only the user ID. The API refuses to
  start in production with the default or a short secret.
- Every resource lookup checks ownership and returns 404, not 403, for other users' data, so IDs
  can't be probed.
- Request bodies reject unknown fields. Numeric inputs are range-checked.
- nginx sets a strict Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff` and a referrer
  policy. Containers run as non-root users.

## Observability

Every response carries an `X-Request-ID` (propagated from nginx or generated) and is logged with
method, path, status and latency. `/health` is a liveness probe; `/health/ready` checks the
database and model and returns 503 when either is unavailable.

## Key decisions

| Decision | Rationale |
|---|---|
| Model trained at image build, not committed | Keeps binaries out of git; every image ships a reproducible artifact whose version is recorded on each prediction. |
| Rule-based advisory derived from data | The original project's hand-picked single "ideal" values (and a ±5 mm rainfall tolerance) were replaced by per-crop percentile bands computed from the dataset, so advice is consistent with what the model learned. |
| Latitude/longitude columns instead of PostGIS | The app only needs points; plain columns keep deployment simple. PostGIS can be added when boundary polygons are needed. |
| Soil defaults built offline, served from a file | `scripts/build_soil_grid.py` reads iSDAsoil's public cloud-optimised GeoTIFFs over Lesotho and stores medians per ~5 km cell and district in `app/data/soil_lesotho.json` (43 KB), so lookups need no external service. P and K are converted from mg/kg to kg/ha with the cell's bulk density (top 20 cm), and N as ~2% of total nitrogen becoming available in a season. Potassium above the ~120 mg/kg sufficiency level is given the training median, because the training data's K separates crops (apple and grapes at 200) rather than measuring soil, and capping Lesotho's real values at 205 skewed results towards grapes. |
| Free, keyless base maps | MapLibre GL with OpenFreeMap vector tiles (OpenStreetMap data) and Esri World Imagery for satellite view, the open sources catalogued by the [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) project. No API keys or billing; both need their on-map credit, which the map shows. |
| Synchronous SQLAlchemy | Request handlers are short and CPU-light; sync code is simpler to reason about and FastAPI runs it in a thread pool. |
| Separate telemetry for stations | Stations measure different things from a soil test (air, soil moisture), with every value optional, so they post to `/telemetry` with a per-device key instead of a user's login. |
| Weather stored, not fetched per request | History is synced incrementally into `weather_days`, so climate summaries are fast and keep working if the provider is briefly unavailable or rate-limited. |
| WhatsApp through self-hosted WAHA | Free and open source, as the pilot requires. The bot and the daily run sit behind a small `WhatsAppSender` interface (`app/services/whatsapp.py`), so switching to the official Cloud API later means one new sender class. Webhooks are verified with HMAC-SHA512, numbers are linked only by messaging a one-time code from the phone, and each milestone has a stable key so it is sent once. |
| Scheduled work on GitHub Actions | Render's free plan has no cron and sleeps when idle; a daily Action calls a secret-protected endpoint, which also wakes the API. |
| Admins from configuration | `AGROAI_ADMIN_EMAILS` names the admins; no admin password is generated, stored or shared. |
