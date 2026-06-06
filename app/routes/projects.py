import asyncio
import json as _json
import logging
import math
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app import db
from app.config import settings
from app.enrichment import fetch_og
from app.influx import influx
from app.moonraker import moonraker

router = APIRouter(prefix="/api/projects", tags=["projects"])

_MM_TO_GRAMS = math.pi * (0.875 ** 2) * 1.24 * 0.001


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: str | None = None
    notes: str | None = None


class FileAdd(BaseModel):
    type: str
    filename: str
    label: str | None = None


class LinkAdd(BaseModel):
    url: str
    label: str | None = None


class PrintLink(BaseModel):
    job_id: str
    project_file_id: int | None = None


@router.get("")
async def list_projects() -> list[dict[str, Any]]:
    return await db.list_projects()


@router.post("", status_code=201)
async def create_project(body: ProjectCreate) -> dict[str, Any]:
    return await db.create_project(body.name)


@router.get("/{project_id}")
async def get_project(project_id: int) -> dict[str, Any]:
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.patch("/{project_id}")
async def update_project(project_id: int, body: ProjectUpdate) -> dict[str, Any]:
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await db.update_project(project_id, data)
    if not result:
        raise HTTPException(404, "Project not found")
    return result


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: int) -> None:
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    for f in project.get("files", []):
        if f["type"] != "gcode":
            try:
                os.remove(f["filename"])
            except OSError:
                pass
    await db.delete_project(project_id)


@router.post("/{project_id}/files", status_code=201)
async def add_file(project_id: int, body: FileAdd) -> dict[str, Any]:
    if not await db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    return await db.add_project_file(project_id, body.type, body.filename, body.label)


@router.post("/{project_id}/files/upload", status_code=201)
async def upload_file(
    project_id: int,
    label: str | None = None,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    if not await db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    stored_path = str(uploads_dir / stored_name)
    contents = await file.read()
    with open(stored_path, "wb") as fh:
        fh.write(contents)
    # Use the file extension as the type (e.g. stl, 3mf, scad, step)
    ext = Path(file.filename or "").suffix.lstrip(".").lower() or "file"
    return await db.add_project_file(project_id, ext, stored_path, label or file.filename)


@router.delete("/{project_id}/files/{file_id}", status_code=204)
async def delete_file(project_id: int, file_id: int) -> None:
    f = await db.get_project_file(file_id)
    if not f or f["project_id"] != project_id:
        raise HTTPException(404, "File not found")
    if f["type"] != "gcode":
        try:
            os.remove(f["filename"])
        except OSError:
            pass
    await db.delete_project_file(file_id)


@router.post("/{project_id}/links", status_code=201)
async def add_link(project_id: int, body: LinkAdd) -> dict[str, Any]:
    if not await db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    link = await db.add_project_link(project_id, body.url, body.label)
    asyncio.create_task(_enrich_link(project_id, link["id"], body.url))
    return link


async def _enrich_link(project_id: int, link_id: int, url: str) -> None:
    og = await fetch_og(url)
    if not any(og.values()):
        return
    await db.set_link_meta(link_id, _json.dumps(og))
    # Set project cover from og:image if the project doesn't have one yet
    project = await db.get_project(project_id)
    if project and not project.get("cover_url") and og.get("image_url"):
        await db.set_project_cover(project_id, og["image_url"], link_id)


async def enrich_existing_links() -> None:
    """Backfill enrichment for links added before this feature. Runs once at startup."""
    log = logging.getLogger(__name__)
    links = await db.list_unenriched_links()
    if not links:
        return
    log.info("enrichment: backfilling %d existing link(s)", len(links))
    for link in links:
        await _enrich_link(link["project_id"], link["id"], link["url"])
    log.info("enrichment: backfill complete")


@router.delete("/{project_id}/links/{link_id}", status_code=204)
async def delete_link(project_id: int, link_id: int, clear_cover: bool = False) -> None:
    if clear_cover:
        project = await db.get_project(project_id)
        if project and project.get("cover_link_id") == link_id:
            await db.set_project_cover(project_id, None, None)
    await db.delete_project_link(link_id)


@router.post("/{project_id}/prints", status_code=201)
async def link_print(project_id: int, body: PrintLink) -> dict[str, Any]:
    if not await db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    duration_s: float | None = None
    filament_g: float | None = None
    cost_total: float | None = None
    try:
        job_data = await moonraker.get("/server/history/job", uid=body.job_id)
        job = job_data.get("job", {})
        duration_s = job.get("print_duration")
        filament_mm = job.get("filament_used") or 0.0
        filament_g = round(filament_mm * _MM_TO_GRAMS, 2)
        filename = job.get("filename", "")
        end_time = job.get("end_time")
        # Prefer timestamp-based lookup so two prints of the same file get distinct costs
        if end_time and filename:
            h = influx.query_by_end_time(filename, float(end_time))
            if h:
                cost_total = h.get("cost_total")
        # Fallback: scan by filename only (covers edge cases with missing end_time)
        if cost_total is None and filename:
            for h in influx.query_history(limit=500):
                if h.get("filename") == filename:
                    cost_total = h.get("cost_total")
                    break
    except Exception:
        pass
    return await db.add_project_print(
        project_id, body.project_file_id, body.job_id,
        duration_s, filament_g, cost_total,
    )


@router.patch("/{project_id}/prints/{job_id}/refresh", status_code=200)
async def refresh_print_stats(project_id: int, job_id: str) -> dict[str, Any]:
    """Re-fetch duration/filament/cost from Moonraker+InfluxDB for an already-linked print."""
    duration_s: float | None = None
    filament_g: float | None = None
    cost_total: float | None = None
    try:
        job_data = await moonraker.get("/server/history/job", uid=job_id)
        job = job_data.get("job", {})
        duration_s = job.get("print_duration")
        filament_mm = job.get("filament_used") or 0.0
        filament_g = round(filament_mm * _MM_TO_GRAMS, 2)
        filename = job.get("filename", "")
        end_time = job.get("end_time")
        if end_time and filename:
            h = influx.query_by_end_time(filename, float(end_time))
            if h:
                cost_total = h.get("cost_total")
        if cost_total is None and filename:
            for h in influx.query_history(limit=500):
                if h.get("filename") == filename:
                    cost_total = h.get("cost_total")
                    break
    except Exception:
        pass
    async with db._conn() as conn:
        await conn.execute(
            """UPDATE project_prints
               SET duration_s = ?, filament_g = ?, cost_total = ?
               WHERE project_id = ? AND job_id = ?""",
            (duration_s, filament_g, cost_total, project_id, job_id),
        )
        await conn.commit()
    return {"job_id": job_id, "duration_s": duration_s, "filament_g": filament_g, "cost_total": cost_total}


@router.delete("/{project_id}/prints/{job_id}", status_code=204)
async def unlink_print(project_id: int, job_id: str) -> None:
    await db.delete_project_print(project_id, job_id)


@router.get("/{project_id}/files/{file_id}/download")
async def download_file(project_id: int, file_id: int) -> Any:
    f = await db.get_project_file(file_id)
    if not f or f["project_id"] != project_id or f["type"] == "gcode":
        raise HTTPException(404, "File not found")
    if not os.path.exists(f["filename"]):
        raise HTTPException(404, "File missing from disk")
    return FileResponse(f["filename"], filename=Path(f["filename"]).name)
