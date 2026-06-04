# ── Stage 1: build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
# outputs to /static (vite outDir: '../static' relative to /build)

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

RUN pip install uv --no-cache-dir

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY app/ ./app/
COPY --from=frontend /static ./static

EXPOSE 8765

CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
