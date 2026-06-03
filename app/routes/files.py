from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from app.config import settings
from app.moonraker import moonraker

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("")
async def list_files() -> list[dict[str, Any]]:
    try:
        files = await moonraker.get_files()
        # Moonraker returns `path` — normalize to `filename` for the frontend
        for f in files:
            if "path" in f and "filename" not in f:
                f["filename"] = f["path"]
        return sorted(files, key=lambda f: f.get("modified", 0), reverse=True)
    except Exception as exc:
        raise HTTPException(502, f"Moonraker error: {exc}") from exc


@router.get("/metadata")
async def file_metadata(filename: str) -> dict[str, Any]:
    try:
        return await moonraker.get_file_metadata(filename)
    except Exception as exc:
        raise HTTPException(502, f"Moonraker error: {exc}") from exc


@router.get("/thumbnail")
async def file_thumbnail(filename: str) -> Response:
    try:
        meta = await moonraker.get_file_metadata(filename)
        thumbs: list[dict[str, Any]] = meta.get("thumbnails", [])
        if not thumbs:
            raise HTTPException(404, "No thumbnails")
        # Pick the largest thumbnail
        thumb = max(thumbs, key=lambda t: t.get("width", 0) * t.get("height", 0))
        rel_path = thumb.get("relative_path", "")
        if not rel_path:
            raise HTTPException(404, "No thumbnail path")
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{settings.moonraker_url}/server/files/gcodes/{rel_path}",
                timeout=10,
            )
            r.raise_for_status()
        return Response(
            content=r.content,
            media_type=r.headers.get("content-type", "image/png"),
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Thumbnail error: {exc}") from exc


@router.post("/upload", status_code=201)
async def upload_file(file: UploadFile) -> dict[str, Any]:
    content = await file.read()
    try:
        result = await moonraker.upload_file(file.filename or "upload.gcode", content)
        return result
    except Exception as exc:
        raise HTTPException(502, f"Moonraker upload error: {exc}") from exc
