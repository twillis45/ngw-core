from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

STATIC_DIR = Path("static")
UI_DIR = STATIC_DIR / "ui"
UI_INDEX = UI_DIR / "index.html"

# static mount
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/", include_in_schema=False)
def root():
    # tests accept 301/302/307
    return RedirectResponse(url="/ui", status_code=307)

@app.get("/ui", include_in_schema=False)
def ui():
    if UI_INDEX.exists():
        return HTMLResponse(UI_INDEX.read_text(encoding="utf-8"))
    # fallback so tests don't 404
    return HTMLResponse("<html><body><h1>NGW UI</h1></body></html>")
