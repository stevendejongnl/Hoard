import base64 as _b64
import logging
from collections.abc import Callable
from typing import Any

import httpx
from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.config import settings
from app.gcode_thumbnail import extract_thumbnail_png, inject_thumbnails
from app.moonraker import MoonrakerClient
from app.routes.dependencies import Moonraker, PrinterClientFactory, ThumbnailStore
from app.routes.thumbnail_cache import ThumbnailCache
from app.thumbnail import render_stl_thumbnails_in_worker

router = APIRouter(prefix="/api/files", tags=["files"])

log = logging.getLogger(__name__)

_CACHE_HEADERS = {"Cache-Control": "public, max-age=3600"}


@router.delete("/thumbnail/cache")
async def clear_thumbnail_cache(thumbnail_cache: ThumbnailStore, filename: str | None = None) -> dict:
    """Clear thumbnail cache. Pass ?filename= to clear one entry, omit to clear all."""
    if filename:
        thumbnail_cache.forget(filename)
        return {"cleared": filename}
    thumbnail_cache.forget_all()
    return {"cleared": "all"}


@router.get("")
async def list_files(moonraker: Moonraker) -> list[dict[str, Any]]:
    try:
        files = await moonraker.get_files()
        # Moonraker returns `path` — normalize to `filename` for the frontend
        for file in files:
            if "path" in file and "filename" not in file:
                file["filename"] = file["path"]
        return sorted(files, key=lambda file: file.get("modified", 0), reverse=True)
    except Exception as exc:
        raise HTTPException(502, f"Moonraker error: {exc}") from exc


@router.get("/metadata")
async def file_metadata(filename: str, moonraker: Moonraker) -> dict[str, Any]:
    try:
        return await moonraker.get_file_metadata(filename)
    except Exception as exc:
        raise HTTPException(502, f"Moonraker error: {exc}") from exc


def _pick_largest(thumbnails: list[dict[str, Any]]) -> dict[str, Any]:
    return max(thumbnails, key=lambda thumbnail: thumbnail.get("width", 0) * thumbnail.get("height", 0))


def _guess_media_type(image: bytes) -> str:
    return "image/jpeg" if image[:2] == b"\xff\xd8" else "image/png"


def _respond_with_image(image: bytes, media_type: str = "image/png") -> Response:
    return Response(content=image, media_type=media_type, headers=_CACHE_HEADERS)


async def _download_thumbnail(
    create_client: Callable[[], httpx.AsyncClient], relative_path: str
) -> httpx.Response | None:
    """The thumbnail file of the printer; Moonraker versions differ on the `gcodes/` prefix, so both are tried."""
    async with create_client() as client:
        for url in (
            f"{settings.moonraker_url}/server/files/gcodes/{relative_path}",
            f"{settings.moonraker_url}/server/files/{relative_path}",
        ):
            try:
                response = await client.get(url, timeout=10)
            except Exception:
                continue
            if response.status_code == 200:
                return response
    return None


def _decode_inline(thumbnail: dict[str, Any]) -> bytes | None:
    try:
        return _b64.b64decode(thumbnail.get("data", ""))
    except Exception:
        return None


async def _fetch_thumbnail(
    moonraker: MoonrakerClient,
    thumbnail_cache: ThumbnailCache,
    create_client: Callable[[], httpx.AsyncClient],
    filename: str,
) -> Response:
    metadata = await moonraker.get_file_metadata(filename)
    thumbnails: list[dict[str, Any]] = metadata.get("thumbnails", [])
    if not thumbnails:
        thumbnail_cache.store(filename, None)
        raise HTTPException(404, "No thumbnails")
    thumbnail = _pick_largest(thumbnails)
    log.debug("thumbnail meta for %s: %s", filename, thumbnail)
    # Moonraker may return base64 data inline (no file fetch needed)
    inline_image = _decode_inline(thumbnail) if thumbnail.get("data", "") else None
    if inline_image is not None:
        thumbnail_cache.store(filename, inline_image)
        return _respond_with_image(inline_image)
    relative_path = thumbnail.get("relative_path", "")
    if not relative_path:
        raise HTTPException(404, "No thumbnail path or data")
    downloaded = await _download_thumbnail(create_client, relative_path)
    if downloaded is None:
        thumbnail_cache.store(filename, None)
        raise HTTPException(404, f"Thumbnail file not found: {relative_path}")
    thumbnail_cache.store(filename, downloaded.content)
    return _respond_with_image(downloaded.content, downloaded.headers.get("content-type", "image/png"))


@router.get("/thumbnail")
async def file_thumbnail(
    filename: str, moonraker: Moonraker, thumbnail_cache: ThumbnailStore, create_client: PrinterClientFactory
) -> Response:
    cached = thumbnail_cache.find(filename)
    if cached and cached.image is None:
        raise HTTPException(404, "No thumbnails")
    if cached and cached.image is not None:
        return _respond_with_image(cached.image)
    try:
        return await _fetch_thumbnail(moonraker, thumbnail_cache, create_client, filename)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Thumbnail error: {exc}") from exc


async def _read_printer_thumbnail(
    moonraker: MoonrakerClient, create_client: Callable[[], httpx.AsyncClient], filename: str
) -> bytes | None:
    """The 3D preview stored by Moonraker in .thumbs/; a printer that fails has none."""
    try:
        thumbnails: list[dict] = (await moonraker.get_file_metadata(filename)).get("thumbnails", [])
        if not thumbnails:
            return None
        best = _pick_largest(thumbnails)
        if best.get("data", ""):
            return _b64.b64decode(best["data"])
        if not best.get("relative_path", ""):
            return None
        downloaded = await _download_thumbnail(create_client, best["relative_path"])
        return downloaded.content if downloaded else None
    except Exception as exc:
        log.debug("Metadata thumbnail failed for %s: %s", filename, exc)
        return None


async def _read_embedded_thumbnail(moonraker: MoonrakerClient, filename: str) -> bytes | None:
    """The thumbnail comments in the gcode header."""
    try:
        return extract_thumbnail_png(await moonraker.download_file_partial(filename))
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(404, "File not found on printer") from exc
        raise HTTPException(502, f"Moonraker error {exc.response.status_code}") from exc
    except Exception as exc:
        log.warning("Gcode fallback failed for %s: %s", filename, exc)
        return None


@router.get("/thumbnail/from-gcode")
async def thumbnail_from_gcode(
    filename: str, moonraker: Moonraker, thumbnail_cache: ThumbnailStore, create_client: PrinterClientFactory
) -> Response:
    """Return best thumbnail: Moonraker .thumbs/ (3D) → embedded → toolpath render."""
    cached = thumbnail_cache.find(filename)
    if cached:
        if cached.image is None:
            raise HTTPException(404, "No thumbnail available")
        return _respond_with_image(cached.image, _guess_media_type(cached.image))
    image = await _read_printer_thumbnail(moonraker, create_client, filename)
    if not image:
        try:
            image = await _read_embedded_thumbnail(moonraker, filename)
        except HTTPException as exc:
            if exc.status_code == 404:
                thumbnail_cache.store(filename, None)
            raise
    thumbnail_cache.store(filename, image)
    if not image:
        raise HTTPException(404, "No thumbnail available")
    return _respond_with_image(image, _guess_media_type(image))


@router.post("/thumbnail/inject")
async def inject_thumbnail(
    stl_file: UploadFile,
    moonraker: Moonraker,
    gcode_filename: str = Form(...),
) -> dict[str, Any]:
    stl_bytes = await stl_file.read()
    try:
        gcode_bytes = await moonraker.download_file(gcode_filename)
    except Exception as exc:
        raise HTTPException(502, f"Could not download gcode: {exc}") from exc
    try:
        thumbnails = await render_stl_thumbnails_in_worker(stl_bytes)
    except Exception as exc:
        raise HTTPException(422, f"STL render failed: {exc}") from exc
    try:
        await moonraker.upload_file(gcode_filename, inject_thumbnails(gcode_bytes, thumbnails))
    except Exception as exc:
        raise HTTPException(502, f"Re-upload failed: {exc}") from exc
    return {"status": "ok", "filename": gcode_filename}


@router.post("/upload", status_code=201)
async def upload_file(file: UploadFile, moonraker: Moonraker) -> dict[str, Any]:
    content = await file.read()
    try:
        return await moonraker.upload_file(file.filename or "upload.gcode", content)
    except Exception as exc:
        raise HTTPException(502, f"Moonraker upload error: {exc}") from exc
