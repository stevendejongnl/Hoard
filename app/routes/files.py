from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse

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


@router.post("/upload", status_code=201)
async def upload_file(file: UploadFile) -> dict[str, Any]:
    content = await file.read()
    try:
        result = await moonraker.upload_file(file.filename or "upload.gcode", content)
        return result
    except Exception as exc:
        raise HTTPException(502, f"Moonraker upload error: {exc}") from exc
