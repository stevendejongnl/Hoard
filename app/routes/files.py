from typing import Any

import httpx
from fastapi import APIRouter, Form, HTTPException, UploadFile
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


@router.post("/thumbnail/inject")
async def inject_thumbnail(
    stl_file: UploadFile,
    gcode_filename: str = Form(...),
) -> dict[str, Any]:
    from app.gcode_thumbnail import has_thumbnails, inject_thumbnails
    from app.thumbnail import render_stl_thumbnails

    stl_bytes = await stl_file.read()

    try:
        gcode_bytes = await moonraker.download_file(gcode_filename)
    except Exception as exc:
        raise HTTPException(502, f"Could not download gcode: {exc}") from exc

    if has_thumbnails(gcode_bytes):
        return {"status": "already_has_thumbnails", "filename": gcode_filename}

    try:
        thumbnails = render_stl_thumbnails(stl_bytes)
    except Exception as exc:
        raise HTTPException(422, f"STL render failed: {exc}") from exc

    modified = inject_thumbnails(gcode_bytes, thumbnails)

    try:
        await moonraker.upload_file(gcode_filename, modified)
    except Exception as exc:
        raise HTTPException(502, f"Re-upload failed: {exc}") from exc

    return {"status": "ok", "filename": gcode_filename}


@router.post("/upload", status_code=201)
async def upload_file(file: UploadFile) -> dict[str, Any]:
    content = await file.read()
    try:
        result = await moonraker.upload_file(file.filename or "upload.gcode", content)
        return result
    except Exception as exc:
        raise HTTPException(502, f"Moonraker upload error: {exc}") from exc
