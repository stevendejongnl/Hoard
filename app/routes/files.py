import time
from typing import Any

import httpx
from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from app.config import settings
from app.moonraker import moonraker

router = APIRouter(prefix="/api/files", tags=["files"])

# In-memory thumbnail cache: filename → (expire_ts, png_bytes | None)
# None = confirmed no thumbnail (also cached to avoid repeated failed lookups)
_THUMB_CACHE: dict[str, tuple[float, bytes | None]] = {}
_THUMB_TTL = 3600  # 1 hour


def _cache_get(filename: str) -> bytes | None | bool:
    """Returns png bytes, None (no thumbnail), or False (not cached)."""
    entry = _THUMB_CACHE.get(filename)
    if entry and entry[0] > time.monotonic():
        return entry[1]  # bytes or None
    return False


def _cache_set(filename: str, png: bytes | None) -> None:
    _THUMB_CACHE[filename] = (time.monotonic() + _THUMB_TTL, png)


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
    import base64
    import logging
    log = logging.getLogger(__name__)

    cached = _cache_get(filename)
    if cached is not False:
        if cached is None:
            raise HTTPException(404, "No thumbnails")
        return Response(content=cached, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})

    try:
        meta = await moonraker.get_file_metadata(filename)
        thumbs: list[dict[str, Any]] = meta.get("thumbnails", [])
        if not thumbs:
            _cache_set(filename, None)
            raise HTTPException(404, "No thumbnails")
        # Pick the largest thumbnail
        thumb = max(thumbs, key=lambda t: t.get("width", 0) * t.get("height", 0))
        log.debug("thumbnail meta for %s: %s", filename, thumb)

        # Moonraker may return base64 data inline (no file fetch needed)
        inline_data = thumb.get("data", "")
        if inline_data:
            try:
                png_bytes = base64.b64decode(inline_data)
                _cache_set(filename, png_bytes)
                return Response(
                    content=png_bytes,
                    media_type="image/png",
                    headers={"Cache-Control": "public, max-age=3600"},
                )
            except Exception:
                pass  # fall through to relative_path

        rel_path = thumb.get("relative_path", "")
        if not rel_path:
            raise HTTPException(404, "No thumbnail path or data")

        # Try both with and without "gcodes/" prefix to handle different Moonraker versions
        async with httpx.AsyncClient() as client:
            for url in [
                f"{settings.moonraker_url}/server/files/gcodes/{rel_path}",
                f"{settings.moonraker_url}/server/files/{rel_path}",
            ]:
                try:
                    r = await client.get(url, timeout=10)
                    if r.status_code == 200:
                        png_content = r.content
                    _cache_set(filename, png_content)
                    return Response(
                            content=png_content,
                            media_type=r.headers.get("content-type", "image/png"),
                            headers={"Cache-Control": "public, max-age=3600"},
                        )
                except Exception:
                    continue
        _cache_set(filename, None)
        raise HTTPException(404, f"Thumbnail file not found: {rel_path}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Thumbnail error: {exc}") from exc


@router.get("/thumbnail/from-gcode")
async def thumbnail_from_gcode(filename: str) -> Response:
    """Extract thumbnail directly from Cura-embedded gcode comments."""
    from app.gcode_thumbnail import extract_thumbnail_png

    cached = _cache_get(filename)
    if cached is not False:
        if cached is None:
            raise HTTPException(404, "No embedded thumbnail in gcode")
        return Response(content=cached, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})

    try:
        # Only fetch first 64 KB — thumbnails are always in the header
        gcode_bytes = await moonraker.download_file_partial(filename, 65536)
    except Exception as exc:
        raise HTTPException(502, f"Could not fetch gcode header: {exc}") from exc

    from app.gcode_thumbnail import render_toolpath_thumbnail
    img = extract_thumbnail_png(gcode_bytes)
    if not img:
        # No embedded thumbnail — render from toolpaths as fallback
        img = render_toolpath_thumbnail(gcode_bytes)
    _cache_set(filename, img)
    if not img:
        raise HTTPException(404, "No thumbnail available")
    # Detect JPEG vs PNG by magic bytes
    media_type = "image/jpeg" if img[:2] == b"\xff\xd8" else "image/png"
    return Response(
        content=img,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )


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
