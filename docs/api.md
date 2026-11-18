# API reference

All endpoints are under `/api/v1` and exchange JSON. The complete, interactive OpenAPI
documentation is served by the API itself at **`/docs`** (Swagger UI) and **`/redoc`**.

## Authentication

```bash
# Register
curl -X POST localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email": "farmer@example.com", "full_name": "Lerato M", "password": "plant-maize-24"}'

# Log in (OAuth2 password form: the email goes in "username")
curl -X POST localhost:8000/api/v1/auth/login \
  -d 'username=farmer@example.com&password=plant-maize-24'
# → {"access_token": "eyJ...", "token_type": "bearer", "expires_in": 3600}
```

Send the token as `Authorization: Bearer <token>` on every other request marked 🔒 below.

## Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Get an access token |
| GET · PATCH · DELETE | `/users/me` 🔒 | Read, update or delete your account |
| POST | `/users/me/password` 🔒 | Change password |
| GET | `/dashboard` 🔒 | Counts plus recent recommendations and active plantings |
| GET · POST | `/fields` 🔒 | List (with latest reading) or create fields |
| GET · PATCH · DELETE | `/fields/{id}` 🔒 | Read, update or delete a field |
| GET · POST · DELETE | `/fields/{id}/readings` 🔒 | List (`since`, `until`, `limit`), add, or clear readings |
| POST | `/fields/{id}/readings/simulate` 🔒 | Generate synthetic sensor history (`days`, `readings_per_day`, `seed`) |
| POST | `/fields/{id}/cycles` 🔒 | Start tracking a planting |
| GET | `/cycles` 🔒 | List plantings (`status`, `field_id`) with growth progress |
| GET · PATCH · DELETE | `/cycles/{id}` 🔒 | Read, update (e.g. record harvest) or delete a planting |
| POST | `/recommendations` 🔒 | Rank crops for `conditions` and/or a field's latest reading |
| GET | `/recommendations` 🔒 | Recommendation history (`field_id`, `limit`, `offset`) |
| GET · DELETE | `/recommendations/{id}` 🔒 | Read or delete one recommendation |
| POST | `/advisory` 🔒 | Assess one crop against conditions, with advice |
| GET | `/crops`, `/crops/{slug}` | Crop catalogue with optimal condition ranges |
| GET | `/model` | Version and metrics of the serving model |
| GET | `/health`, `/health/ready` | Liveness and readiness (outside `/api/v1`) |

## Example: recommendation

```bash
curl -X POST localhost:8000/api/v1/recommendations \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"conditions": {"nitrogen": 90, "phosphorus": 42, "potassium": 43,
       "temperature": 20.9, "humidity": 82, "ph": 6.5, "rainfall": 203}, "top_k": 3}'
```

```json
{
  "id": "4f0c…",
  "recommended_crop": "rice",
  "predictions": [
    {"crop": "rice", "name": "Rice", "probability": 0.99},
    {"crop": "jute", "name": "Jute", "probability": 0.01},
    {"crop": "coffee", "name": "Coffee", "probability": 0.0}
  ],
  "model_version": "20261118-random_forest-808e1d84",
  "warnings": [],
  "inputs": {"nitrogen": 90.0, "…": "…"},
  "field_id": null,
  "created_at": "2026-11-18T12:35:44Z"
}
```

## Errors

Errors use FastAPI's standard shape: `{"detail": "message"}`, or for validation failures (422)
`{"detail": [{"loc": ["body", "conditions", "ph"], "msg": "…"}]}`.

| Status | Meaning |
|---|---|
| 401 | Missing, invalid or expired token |
| 404 | Not found, or owned by another user |
| 409 | Conflict (duplicate email or field name; field has no readings to recommend from) |
| 422 | Validation error |
| 503 | Model not loaded (train it with `make train`) |
