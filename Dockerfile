# ── Stage 1: Build Vite frontend ─────────────────────────────────────────────
FROM node:18-slim AS ui-builder

WORKDIR /build/ui
COPY ui/package*.json ./
RUN npm ci --silent
COPY ui/ ./
RUN npm run build
# Output lands at /build/static/ui (vite outDir: '../static/ui')


# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.10-slim

# System libraries required by mediapipe + opencv
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer-cached unless requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Overlay built frontend from Stage 1 (replaces any stale local build)
COPY --from=ui-builder /build/static/ui ./static/ui

# Ensure runtime directories always exist
RUN mkdir -p data static/uploads static/www static/ui

# Non-root user
RUN useradd -m -u 1001 ngw && chown -R ngw:ngw /app
USER ngw

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
