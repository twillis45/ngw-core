from __future__ import annotations

# Load .env BEFORE any engine imports — engine/vlm.py reads API keys at
# module import time, so dotenv must run first.
from dotenv import load_dotenv
load_dotenv()

import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List

from pathlib import Path

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

from api.routes.shoot_match import router as shoot_match_router
from api.routes.recommend import router as recommend_router
from api.routes.auth import router as auth_router
from api.routes.user_data import router as user_data_router
from api.routes.admin import router as admin_router
from api.routes.diagnostics import router as diagnostics_router
from api.routes.lab import router as lab_router
from api.routes.lab_benchmarks import router as lab_benchmarks_router
from api.routes.lab_signals import router as lab_signals_router
from api.routes.exec_dashboard import router as exec_dashboard_router
from api.routes.lighting_dna import router as lighting_dna_router
from api.routes.shoot_mode import router as shoot_mode_router
from api.routes.spatial import router as spatial_router
from api.routes.blueprint import router as blueprint_router
from api.routes.live_feedback import router as live_feedback_router
from api.routes.style_dna import router as style_dna_router
from api.routes.track import router as track_router
from api.routes.learning import router as learning_router
from api.routes.flags import router as flags_router
from api.routes.experiments import router as experiments_router
from api.routes.paywall import router as paywall_router
from api.routes.stripe_checkout import router as stripe_router
from api.routes.waitlist import router as waitlist_router
from db.database import init_db

from engine.services.recommend_service import ENGINE_VERSION


@asynccontextmanager
async def lifespan(app):
    # Ensure runtime directories exist (safe on both local dev and Render/Docker)
    for d in ("data", "static/uploads", "static/www", "static/ui"):
        Path(d).mkdir(parents=True, exist_ok=True)
    init_db()
    from db.benchmark import init_benchmark_tables
    init_benchmark_tables()
    from db.benchmark_baseline import init_baseline_tables
    init_baseline_tables()
    from db.signals import init_signals_tables, seed_signals
    init_signals_tables()
    seed_signals()   # no-op if rows already exist
    from db.experiments import init_experiments_tables
    init_experiments_tables()

    # Start background scheduler (no-op if ENABLE_SCHEDULER is not set)
    from engine.scheduler import boot_scheduler, stop_scheduler
    boot_scheduler()

    # Start waitlist email sequence loop (no-op if WAITLIST_SEQUENCE_ENABLED not set)
    from engine.email_sequence import boot_sequence, stop_sequence
    boot_sequence()

    yield

    stop_scheduler()
    stop_sequence()


app = FastAPI(title="NGW Core v1", version=ENGINE_VERSION, lifespan=lifespan)


# ── Global exception handler ──────────────────────────────────────────────────
# Ensures every unhandled error returns structured JSON (not an HTML 500 page)
# so the frontend can always parse `response.json().detail`.

@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Please try again."},
    )


# ── CORS ─────────────────────────────────────────────────────────────────────
# Set ALLOWED_ORIGINS env var to a comma-separated list of origins.
# Example: https://ngw.vercel.app,https://www.noguesswork.com
# Defaults to localhost only for safe local development.
_raw_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://localhost:8000"
)
_allowed_origins: List[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)
# ─────────────────────────────────────────────────────────────────────────────

app.include_router(shoot_match_router, prefix="/api")
app.include_router(recommend_router)  # mounted at root (not /api) for backward compat
app.include_router(auth_router, prefix="/api")
app.include_router(user_data_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(diagnostics_router, prefix="/api")
app.include_router(lab_router, prefix="/api")
app.include_router(lab_benchmarks_router, prefix="/api/lab")
app.include_router(exec_dashboard_router, prefix="/api")
app.include_router(lighting_dna_router, prefix="/api")
app.include_router(shoot_mode_router, prefix="/api")
app.include_router(spatial_router, prefix="/api")
app.include_router(blueprint_router, prefix="/api")
app.include_router(live_feedback_router, prefix="/api")
app.include_router(style_dna_router, prefix="/api")
app.include_router(track_router, prefix="/api")
app.include_router(learning_router, prefix="/api")
app.include_router(lab_signals_router, prefix="/api")
app.include_router(flags_router, prefix="/api")
app.include_router(experiments_router, prefix="/api")
app.include_router(paywall_router, prefix="/api")
app.include_router(stripe_router, prefix="/api")
app.include_router(waitlist_router)
app.mount("/www", StaticFiles(directory="static/www"), name="www")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.middleware("http")
async def cache_headers(request: Request, call_next):
    response = await call_next(request)
    # Vite build outputs content-hashed filenames under /static/ui/assets/.
    # These are safe to cache forever — new deploy = new hash = new URL.
    if request.url.path.startswith("/static/ui/assets/"):
        response.headers["Cache-Control"] = "max-age=31536000, immutable"
    return response

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "engine_version": ENGINE_VERSION}


def _is_mobile(request: Request) -> bool:
    """Check User-Agent for mobile device indicators."""
    ua = (request.headers.get("user-agent") or "").lower()
    return any(tok in ua for tok in ("iphone", "android", "mobile", "ipod"))


@app.get("/")
def root(request: Request):
    # Mobile → straight to the app (tool UI)
    if _is_mobile(request):
        return RedirectResponse(url="/ui", status_code=307)
    # Desktop → marketing site
    www_path = Path("static/www/index.html")
    if www_path.exists():
        return HTMLResponse(www_path.read_text(encoding="utf-8"))
    return RedirectResponse(url="/ui", status_code=307)


_MARKETING_PAGES = {"features", "pricing", "library", "blog", "login", "signup", "early-access"}

_DOCS_PAGES = {"index", "patterns", "glossary", "how-it-works"}


@app.get("/features")
@app.get("/pricing")
@app.get("/library")
@app.get("/blog")
@app.get("/login")
@app.get("/signup")
@app.get("/early-access")
def marketing_page(request: Request):
    page = request.url.path.lstrip("/")
    if page not in _MARKETING_PAGES:
        raise HTTPException(status_code=404)
    # Mobile → redirect login/signup to the app UI
    if _is_mobile(request) and page in ("login", "signup"):
        return RedirectResponse(url="/ui", status_code=307)
    file_path = Path(f"static/www/{page}.html")
    if file_path.exists():
        return HTMLResponse(file_path.read_text(encoding="utf-8"))
    raise HTTPException(status_code=404)


@app.get("/docs")
def docs_index_redirect():
    return RedirectResponse(url="/docs/", status_code=301)


@app.get("/docs/")
@app.get("/docs/{page}")
def docs_page(page: str = "index"):
    slug = page.rstrip("/") or "index"
    slug = slug.removesuffix(".html")
    if slug not in _DOCS_PAGES:
        raise HTTPException(status_code=404)
    file_path = Path(f"static/www/docs/{slug}.html")
    if file_path.exists():
        return HTMLResponse(file_path.read_text(encoding="utf-8"))
    raise HTTPException(status_code=404)


@app.get("/sitemap.xml")
def sitemap():
    base = "https://noguesswork.com"
    urls = [
        f"{base}/",
        f"{base}/features",
        f"{base}/pricing",
        f"{base}/blog",
        f"{base}/library",
        f"{base}/docs/",
        f"{base}/docs/patterns",
        f"{base}/docs/glossary",
        f"{base}/docs/how-it-works",
    ]
    items = "\n".join(
        f"  <url><loc>{u}</loc><changefreq>weekly</changefreq></url>"
        for u in urls
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{items}\n"
        "</urlset>"
    )
    return HTMLResponse(content=xml, media_type="application/xml")


@app.get("/robots.txt")
def robots_txt():
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Allow: /docs/\n"
        "Allow: /features\n"
        "Allow: /pricing\n"
        "Allow: /blog\n"
        "Allow: /library\n"
        "Disallow: /api/\n"
        "Disallow: /ui\n"
        "Disallow: /static/uploads/\n"
        "Sitemap: https://noguesswork.com/sitemap.xml\n"
    )
    return HTMLResponse(content=content, media_type="text/plain")


@app.get("/ui")
def ui() -> HTMLResponse:
    ui_path = Path("static/ui/index.html")
    html = ui_path.read_text(encoding="utf-8") if ui_path.exists() else "<html><body><h1>NGW UI</h1></body></html>"
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


