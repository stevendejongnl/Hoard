from fastapi import APIRouter, HTTPException
from app.moonraker import moonraker

router = APIRouter(prefix="/api/webcams", tags=["webcams"])


@router.get("")
async def list_webcams():
    try:
        data = await moonraker.get("/server/webcams/list")
        cams = data.get("webcams", [])
        base = moonraker._client_base()
        for cam in cams:
            # Make URLs absolute so the frontend can use them directly
            for field in ("stream_url", "snapshot_url"):
                url = cam.get(field, "")
                if url.startswith("/"):
                    cam[field] = base + url
        return cams
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
