from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.influx import influx

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def list_history(limit: int = 20, offset: int = 0) -> dict[str, Any]:
    records = influx.query_history(limit=limit, offset=offset)
    total = influx.count_history()

    # Enrich with spool info from SQLite
    for record in records:
        job_id = record.get("job_id") or record.get("filename", "")
        ps = await db.get_print_spool(job_id)
        if ps:
            record["spool"] = {
                "id": ps.get("spool_id"),
                "brand": ps.get("brand"),
                "material": ps.get("material"),
                "color": ps.get("color"),
                "color_hex": ps.get("color_hex"),
            }
        else:
            record["spool"] = None

    return {"records": records, "total": total, "limit": limit, "offset": offset}


class SpoolAssign(BaseModel):
    spool_id: int


@router.patch("/{job_id}/spool")
async def assign_spool(job_id: str, body: SpoolAssign) -> dict[str, Any]:
    spools = await db.list_spools()
    spool = next((s for s in spools if s["id"] == body.spool_id), None)
    if not spool:
        raise HTTPException(404, "Spool not found")

    # Get existing print record to rewrite InfluxDB point with new tags
    existing = await db.get_print_spool(job_id)

    await db.link_print_spool(job_id, body.spool_id, existing["filament_used_g"] if existing else 0)

    return {"job_id": job_id, "spool_id": body.spool_id}
