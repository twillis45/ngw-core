# NGW Core — Deployment Guide

Beta deployment: **Vercel** (frontend) + **Render** (backend API).

---

## Architecture

```
Browser → Vercel (static UI) → Render (FastAPI API + engine)
```

The Vite frontend is a fully static build served from Vercel.
All API calls are proxied to your Render service via `VITE_API_BASE_URL`.

---

## 1. Backend — Render

### Service type
**Web Service** → Docker or Python environment.

### Start command
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Build command (if using pip)
```bash
pip install -r requirements.txt
```

### Environment variables (set in Render dashboard)

| Variable | Required | Example value | Notes |
|---|---|---|---|
| `ALLOWED_ORIGINS` | **Yes** | `https://ngw.vercel.app,https://www.noguesswork.com` | Comma-separated; must include your Vercel domain |
| `SECRET_KEY` | **Yes** | random 64-char hex | Used for JWT signing — `openssl rand -hex 32` |
| `DATABASE_URL` | **Yes** | `sqlite:///./data/ngw.db` | Or a Postgres URL for prod |
| `OPENAI_API_KEY` | No | `sk-...` | Only needed if VLM features are enabled |
| `ADMIN_EMAILS` | No | `you@example.com` | Comma-separated admin accounts |

> **Never** put secrets in `requirements.txt` or commit a `.env` file.

### Health check
Render → Settings → Health Check Path: `/health`
Expected response: `{"status": "ok", "engine_version": "..."}`

### Static files
The engine writes uploads to `static/uploads/` — make sure the Render disk is
persisted (add a Persistent Disk in Render dashboard) or point uploads to an
object store.

---

## 2. Frontend — Vercel

### Build & Output settings

| Setting | Value |
|---|---|
| Framework | Vite |
| Root directory | `ui` |
| Build command | `npm run build` |
| Output directory | `../static/ui` |

### Environment variables (set in Vercel dashboard)

| Variable | Required | Example value | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | **Yes** | `https://ngw-api.onrender.com` | No trailing slash; leave **empty** for local dev (Vite proxy handles it) |

> After adding/changing env vars, trigger a new Vercel deployment.

### Vercel routing
The app is a SPA. Add a `vercel.json` at the repo root if you need clean URL
rewrites:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 3. Local development

```bash
# Backend
cp .env.example .env          # fill in SECRET_KEY etc.
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (new terminal)
cd ui
cp .env.example .env.local    # VITE_API_BASE_URL can stay empty
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/recommend` to `localhost:8000`
(see `ui/vite.config.js`) so no CORS issues during local development.

---

## 4. Common issues

| Symptom | Fix |
|---|---|
| CORS error in browser | Add Vercel domain to `ALLOWED_ORIGINS` on Render |
| 401 on all API calls | `SECRET_KEY` mismatch — set the same value on Render as you used to generate tokens |
| Blank screen on Vercel | `VITE_API_BASE_URL` not set, or wrong Render URL |
| 413 on image upload | File >10 MB — compress before uploading |
| 415 on image upload | Unsupported format — use JPEG, PNG, WebP, HEIC, or TIFF |
| VLM toggle disabled | OpenAI quota exceeded — add billing or set `OPENAI_API_KEY` to empty to disable |
| `python-dotenv` not found | Run `pip install python-dotenv` or check `requirements.txt` |

---

## 5. Verify deployment

1. `GET https://<render-url>/health` → `{"status":"ok"}`
2. Open `https://<vercel-url>/` → marketing page (desktop) or app (mobile)
3. Navigate to the app → upload a reference image → confirm analysis returns
4. Check Render logs for any startup errors
