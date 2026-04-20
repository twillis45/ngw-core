"""
Batch analysis — Studio-tier feature.

POST /api/batch/analyze   — upload up to 10 images, returns batch_id
GET  /api/batch/{id}      — poll for status + results
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth.plan_guard import require_plan
from db.database import create_batch_job, update_batch_job, get_batch_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/batch", tags=["batch"])

MAX_BATCH_SIZE = 10
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="batch")


def _analyze_single(image_bytes: bytes, filename: str) -> dict:
    """Run the analysis pipeline on a single image. Returns result summary."""
    tmp = None
    try:
        suffix = os.path.splitext(filename)[1] or ".jpg"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.write(image_bytes)
        tmp.close()

        from engine.orchestrator import analyze_image
        ar = analyze_image(tmp.name, run_extended=True, run_vlm=False, run_solver=True)

        return {
            "filename": filename,
            "status": "ok",
            "analysis_id": getattr(ar, "analysis_id", None),
            "pattern": getattr(ar, "authoritative_pattern", None) or "unknown",
            "confidence": round(getattr(ar, "pattern_confidence", 0.0), 3),
        }
    except Exception as exc:
        logger.error("batch: analysis failed for %s — %s", filename, exc)
        return {
            "filename": filename,
            "status": "error",
            "error": str(exc)[:200],
        }
    finally:
        if tmp:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


async def _run_batch(job_id: str, images: list[tuple[str, bytes]]):
    """Process images sequentially in a thread pool, updating the DB after each."""
    update_batch_job(job_id, status="running")
    results = []
    loop = asyncio.get_event_loop()

    for i, (filename, data) in enumerate(images):
        try:
            result = await loop.run_in_executor(_executor, _analyze_single, data, filename)
        except Exception as exc:
            result = {"filename": filename, "status": "error", "error": str(exc)[:200]}

        results.append(result)
        update_batch_job(
            job_id,
            completed=i + 1,
            results_json=json.dumps(results),
        )

    update_batch_job(job_id, status="complete", results_json=json.dumps(results))
    logger.info("batch: job %s complete — %d images", job_id, len(images))


@router.post("/analyze")
async def batch_analyze(
    images: List[UploadFile] = File(...),
    user=Depends(require_plan("studio")),
):
    """Upload up to 10 images for batch analysis. Returns a batch_id to poll."""
    if len(images) > MAX_BATCH_SIZE:
        raise HTTPException(400, f"Maximum {MAX_BATCH_SIZE} images per batch.")
    if len(images) == 0:
        raise HTTPException(400, "At least one image is required.")

    # Read all images into memory before returning (keeps UploadFile handles valid)
    image_data = []
    for img in images:
        data = await img.read()
        if len(data) > 20 * 1024 * 1024:  # 20 MB limit per image
            raise HTTPException(400, f"Image {img.filename} exceeds 20 MB limit.")
        image_data.append((img.filename or "image.jpg", data))

    email = user.get("email", "")
    job = create_batch_job(email, len(image_data))

    # Fire and forget — background task processes images
    asyncio.create_task(_run_batch(job["id"], image_data))

    return {"batch_id": job["id"], "total_images": len(image_data), "status": "pending"}


@router.get("/{batch_id}")
async def batch_status(
    batch_id: str,
    user=Depends(require_plan("studio")),
):
    """Poll batch job status. Returns progress and completed results."""
    email = user.get("email", "")
    job = get_batch_job(batch_id, user_email=email)
    if not job:
        raise HTTPException(404, "Batch job not found.")

    results = []
    if job.get("results_json"):
        try:
            results = json.loads(job["results_json"])
        except (json.JSONDecodeError, TypeError):
            pass

    return {
        "batch_id": job["id"],
        "status": job["status"],
        "total_images": job["total_images"],
        "completed": job["completed"],
        "results": results,
    }
