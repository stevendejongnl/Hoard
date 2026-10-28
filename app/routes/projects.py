import asyncio
import json as _json
import logging
import math
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.enrichment import fetch_og
from app.influx import InfluxClient
from app.moonraker import MoonrakerClient
from app.routes.dependencies import (
    Cache,
    Database,
    Influx,
    Moonraker,
    provide_cache,
    provide_database,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])

_MM_TO_GRAMS = math.pi * (0.875**2) * 1.24 * 0.001


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


@dataclass
class PrintStats:
    duration_s: float | None = None
    filament_g: float | None = None
    cost_total: float | None = None


async def _invalidate_project(cache: ModuleType, project_id: int, *extra_keys: str) -> None:
    await cache.invalidate("projects:list", f"project:{project_id}", *extra_keys)


async def _require_project(database: ModuleType, project_id: int) -> dict[str, Any]:
    project = await database.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def _remove_stored_file(project_file: dict[str, Any]) -> None:
    """Delete the file of a project file from the disk; the gcode of a project lives on the printer."""
    if project_file["type"] == "gcode":
        return
    try:
        os.remove(project_file["filename"])
    except OSError:
        pass


@router.get("")
async def list_projects(database: Database, cache: Cache) -> list[dict[str, Any]]:
    return await cache.get_or_set("projects:list", database.list_projects, ttl=300)


@router.post("", status_code=201)
async def create_project(body: ProjectCreate, database: Database, cache: Cache) -> dict[str, Any]:
    result = await database.create_project(body.name)
    await cache.invalidate("projects:list")
    return result


@router.get("/{project_id}")
async def get_project(project_id: int, database: Database, cache: Cache) -> dict[str, Any]:
    async def fetch_project() -> dict[str, Any]:
        return await _require_project(database, project_id)

    return await cache.get_or_set(f"project:{project_id}", fetch_project, ttl=300)


@router.patch("/{project_id}")
async def update_project(project_id: int, body: ProjectUpdate, database: Database, cache: Cache) -> dict[str, Any]:
    data = {key: value for key, value in body.model_dump().items() if value is not None}
    result = await database.update_project(project_id, data)
    if not result:
        raise HTTPException(404, "Project not found")
    await _invalidate_project(cache, project_id)
    return result


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: int, database: Database, cache: Cache) -> None:
    project = await _require_project(database, project_id)
    for project_file in project.get("files", []):
        _remove_stored_file(project_file)
    await database.delete_project(project_id)
    await _invalidate_project(cache, project_id)


@router.post("/{project_id}/files", status_code=201)
async def add_file(project_id: int, body: FileAdd, database: Database, cache: Cache) -> dict[str, Any]:
    await _require_project(database, project_id)
    result = await database.add_project_file(project_id, body.type, body.filename, body.label)
    await _invalidate_project(cache, project_id)
    return result


def _store_upload(contents: bytes, original_name: str | None) -> str:
    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    stored_path = str(uploads_dir / f"{uuid.uuid4().hex[:8]}_{original_name}")
    with open(stored_path, "wb") as stored_file:
        stored_file.write(contents)
    return stored_path


@router.post("/{project_id}/files/upload", status_code=201)
async def upload_file(
    project_id: int,
    database: Database,
    cache: Cache,
    label: str | None = None,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    await _require_project(database, project_id)
    stored_path = _store_upload(await file.read(), file.filename)
    # Use the file extension as the type (e.g. stl, 3mf, scad, step)
    extension = Path(file.filename or "").suffix.lstrip(".").lower() or "file"
    result = await database.add_project_file(project_id, extension, stored_path, label or file.filename)
    await _invalidate_project(cache, project_id)
    return result


@router.delete("/{project_id}/files/{file_id}", status_code=204)
async def delete_file(project_id: int, file_id: int, database: Database, cache: Cache) -> None:
    project_file = await database.get_project_file(file_id)
    if not project_file or project_file["project_id"] != project_id:
        raise HTTPException(404, "File not found")
    _remove_stored_file(project_file)
    await database.delete_project_file(file_id)
    await _invalidate_project(cache, project_id)


@router.post("/{project_id}/links", status_code=201)
async def add_link(project_id: int, body: LinkAdd, database: Database, cache: Cache) -> dict[str, Any]:
    await _require_project(database, project_id)
    link = await database.add_project_link(project_id, body.url, body.label)
    asyncio.create_task(_enrich_link(project_id, link["id"], body.url, database, cache))
    await _invalidate_project(cache, project_id)
    return link


async def _enrich_link(
    project_id: int,
    link_id: int,
    url: str,
    database: ModuleType | None = None,
    cache: ModuleType | None = None,
) -> None:
    database = database or provide_database()
    cache = cache or provide_cache()
    try:
        og = await fetch_og(url)
        if not any(og.values()):
            return
        await database.set_link_meta(link_id, _json.dumps(og))
        project = await database.get_project(project_id)
        if project and not project.get("cover_url") and og.get("image_url"):
            await database.set_project_cover(project_id, og["image_url"], link_id)
    finally:
        await _invalidate_project(cache, project_id)


async def enrich_existing_links(database: ModuleType | None = None, cache: ModuleType | None = None) -> None:
    """Backfill enrichment for links added before this feature. Runs once at startup."""
    database = database or provide_database()
    cache = cache or provide_cache()
    log = logging.getLogger(__name__)
    links = await database.list_unenriched_links()
    if not links:
        return
    log.info("enrichment: backfilling %d existing link(s)", len(links))
    for link in links:
        await _enrich_link(link["project_id"], link["id"], link["url"], database, cache)
    log.info("enrichment: backfill complete")


@router.delete("/{project_id}/links/{link_id}", status_code=204)
async def delete_link(project_id: int, link_id: int, database: Database, cache: Cache) -> None:
    project = await database.get_project(project_id)
    if project and project.get("cover_link_id") == link_id:
        await database.set_project_cover(project_id, None, None)
    await database.delete_project_link(link_id)
    await _invalidate_project(cache, project_id)


async def _find_cost(influx: InfluxClient, filename: str, end_time: float | None) -> float | None:
    """Cost of a print: by the end time of its file first, else the first row of that file name."""
    if end_time and filename:
        point = await influx.query_by_end_time(filename, float(end_time))
        if point and point.get("cost_total") is not None:
            return point["cost_total"]
    if not filename:
        return None
    for point in await influx.query_history(limit=500):
        if point.get("filename") == filename:
            return point.get("cost_total")
    return None


async def _read_print_stats(moonraker: MoonrakerClient, influx: InfluxClient, job_id: str) -> PrintStats:
    """Duration, filament and cost of a job; what could not be read stays empty."""
    stats = PrintStats()
    try:
        job = (await moonraker.get("/server/history/job", uid=job_id)).get("job", {})
        stats.duration_s = job.get("print_duration")
        stats.filament_g = round((job.get("filament_used") or 0.0) * _MM_TO_GRAMS, 2)
        stats.cost_total = await _find_cost(influx, job.get("filename", ""), job.get("end_time"))
    except Exception:
        pass
    return stats


@router.post("/{project_id}/prints", status_code=201)
async def link_print(
    project_id: int, body: PrintLink, moonraker: Moonraker, influx: Influx, database: Database, cache: Cache
) -> dict[str, Any]:
    await _require_project(database, project_id)
    stats = await _read_print_stats(moonraker, influx, body.job_id)
    result = await database.add_project_print(
        project_id, body.project_file_id, body.job_id, stats.duration_s, stats.filament_g, stats.cost_total
    )
    await _invalidate_project(cache, project_id, f"print:{body.job_id}")
    return result


async def _store_print_stats(database: ModuleType, project_id: int, job_id: str, stats: PrintStats) -> None:
    async with database._conn() as connection:
        await connection.execute(
            """UPDATE project_prints
               SET duration_s = ?, filament_g = ?, cost_total = ?
               WHERE project_id = ? AND job_id = ?""",
            (stats.duration_s, stats.filament_g, stats.cost_total, project_id, job_id),
        )
        await connection.commit()


@router.patch("/{project_id}/prints/{job_id}/refresh", status_code=200)
async def refresh_print_stats(
    project_id: int, job_id: str, moonraker: Moonraker, influx: Influx, database: Database, cache: Cache
) -> dict[str, Any]:
    """Re-fetch duration/filament/cost from Moonraker+InfluxDB for an already-linked print."""
    stats = await _read_print_stats(moonraker, influx, job_id)
    await _store_print_stats(database, project_id, job_id, stats)
    await _invalidate_project(cache, project_id)
    return {
        "job_id": job_id,
        "duration_s": stats.duration_s,
        "filament_g": stats.filament_g,
        "cost_total": stats.cost_total,
    }


@router.delete("/{project_id}/prints/{job_id}", status_code=204)
async def unlink_print(project_id: int, job_id: str, database: Database, cache: Cache) -> None:
    await database.delete_project_print(project_id, job_id)
    await _invalidate_project(cache, project_id, f"print:{job_id}")


@router.get("/{project_id}/files/{file_id}/download")
async def download_file(project_id: int, file_id: int, database: Database) -> Any:
    project_file = await database.get_project_file(file_id)
    if not project_file or project_file["project_id"] != project_id or project_file["type"] == "gcode":
        raise HTTPException(404, "File not found")
    if not os.path.exists(project_file["filename"]):
        raise HTTPException(404, "File missing from disk")
    return FileResponse(project_file["filename"], filename=Path(project_file["filename"]).name)
