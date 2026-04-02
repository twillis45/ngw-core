# NGW Core — Deployment Guide

Deployment: **Render** (full-stack — serves both the FastAPI backend and the built Vite frontend as static files).

---

## Architecture

```
Browser → Render (FastAPI + static UI + engine)
```

The Vite frontend is built locally (`npm run build` → outputs to `static/ui/`), committed to the repo, and served as static files by the FastAPI app. All API calls go to the same Render service.

---

## 1. Render Service

### Service type
**Web Service** → Docker (uses `Dockerfile` at repo root).

### Start command (Docker)
Defined in `Dockerfile` — runs:
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Environment variables (set in Render dashboard)

| Variable | Required | Example value | Notes |
|---|---|---|---|
| `ALLOWED_ORIGINS` | **Yes** | `https://www.noguesswork.com` | Comma-separated allowed origins |
| `NGW_JWT_SECRET` | **Yes** | random 64-char hex | JWT signing key — `openssl rand -hex 32` |
| `DATABASE_URL` | **Yes** | `sqlite:///./data/ngw.db` | Or a Postgres URL for prod |
| `OPENAI_API_KEY` | No | `sk-...` | Only needed if VLM features are enabled |
| `ADMIN_EMAILS` | No | `you@example.com` | Comma-separated admin accounts |

> **Never** put secrets in `requirements.txt` or commit a `.env` file.

### Health check
Render → Settings → Health Check Path: `/health`
Expected response: `{"status": "ok", "engine_version": "..."}`

### Persistent Disk
Add a Persistent Disk in Render dashboard, mounted at `/app/data` (1 GB minimum).
This persists the SQLite DB and reference dataset across deploys.

---

## 2. Frontend Build

The UI is a Vite SPA. Build output goes directly into `static/ui/` which FastAPI serves.

```bash
cd ui
npm install
npm run build        # outputs to ../static/ui/
```

Commit the built `static/ui/` files — Render serves them directly without a separate build step.

---

## 3. Local development

```bash
# Backend
cp .env.example .env          # fill in NGW_JWT_SECRET etc.
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (new terminal)
cd ui
npm install
npm run dev
```

The Vite dev server proxies `/api` to `localhost:8000` (see `ui/vite.config.js`) — no CORS issues during local development.

---

## 4. Deploying changes

```bash
# Build the frontend
cd ui && npm run build && cd ..

# Commit everything (including new static/ui/ bundle)
git add -A
git commit -m "your message"
git push origin main         # Render auto-deploys on push to main
```

Render rebuild takes ~5–10 min (Docker build). Monitor in the Render dashboard.

---

## 5. Common issues

| Symptom | Fix |
|---|---|
| CORS error in browser | Check `ALLOWED_ORIGINS` on Render includes your domain |
| 401 on all API calls | `NGW_JWT_SECRET` mismatch between local and Render |
| Blank screen / 404 on routes | Verify `static/ui/` is committed and up to date |
| 413 on image upload | File >10 MB — compress before uploading |
| 415 on image upload | Unsupported format — use JPEG, PNG, WebP, HEIC, or TIFF |
| VLM toggle disabled | OpenAI quota exceeded — add billing or set `OPENAI_API_KEY` to empty |
| `python-dotenv` not found | Run `pip install python-dotenv` or check `requirements.txt` |
| Old bundle being served | Run `npm run build` in `ui/`, commit `static/ui/`, redeploy |

---

## 6. Verify deployment

1. `GET https://<render-url>/health` → `{"status":"ok"}`
2. Open `https://<render-url>/` → app loads correctly
3. Upload a reference image → confirm analysis returns
4. Check Render logs for any startup errors
