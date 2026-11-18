# AgroAI backend

FastAPI service for AgroAI: authentication, fields, sensor readings, crop cycles, ML
recommendations and the rule-based advisory engine.

```bash
uv sync                                   # install
cp .env.example .env                      # local settings
uv run python -m app.ml.train             # train the model into artifacts/
uv run alembic upgrade head               # migrate
uv run uvicorn app.main:app --reload      # serve on :8000 (docs at /docs)
uv run pytest --cov                       # test
```

Settings are read from `AGROAI_*` environment variables; see `app/core/config.py` and
`.env.example`. See the [project README](../README.md) and [docs](../docs) for more.
