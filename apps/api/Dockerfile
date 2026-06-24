# ─── Build stage ───────────────────────────────────────────────
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY data ./data

RUN uv sync --frozen --no-dev || uv sync --no-dev

# Bake the synthetic DuckDB into the image so the container boots ready
# (no cold-start build). Non-fatal if seed self-generates at runtime instead.
RUN uv run python -m citipoints_api.data.seed || true

# ─── Runtime stage ─────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash citi

WORKDIR /app
COPY --from=builder --chown=citi:citi /app /app

USER citi
EXPOSE 8000

# Bind the platform-injected $PORT (Render/Fly/Railway set it; default 8000 local).
# Shell form so ${PORT} expands. -w 1 keeps free-tier memory in budget for the ML libs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1

CMD gunicorn citipoints_api.main:app -k uvicorn.workers.UvicornWorker -w 1 -b 0.0.0.0:${PORT:-8000} --timeout 120
