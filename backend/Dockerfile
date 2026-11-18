# syntax=docker/dockerfile:1

# ---- Build: install dependencies and train the model --------------------------------------
FROM python:3.13-slim AS build
RUN pip install --no-cache-dir uv==0.11.32
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY data ./data
# The model is trained at build time so every image ships with a matching, reproducible artifact.
RUN .venv/bin/python -m app.ml.train

# ---- Runtime --------------------------------------------------------------------------------
FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    AGROAI_ENVIRONMENT=production
WORKDIR /app
RUN useradd --create-home --uid 10001 agroai
COPY --from=build --chown=agroai:agroai /app /app
USER agroai

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

# Apply pending migrations, then serve. For multiple replicas, run migrations as a separate step.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
