from typing import Any

from fastapi import APIRouter

from app import db
from app.moonraker import moonraker

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search(q: str = "", scope: str = "all") -> dict[str, Any]:
    """Search across history, spools and projects.

    scope: comma-separated list of 'h', 's', 'p' or 'all'
    """
    q = q.strip().lower()
    scopes = {s.strip() for s in scope.split(",")} if scope != "all" else {"h", "s", "p"}

    results: dict[str, list[dict[str, Any]]] = {"history": [], "spools": [], "projects": []}

    if not q:
        return results

    if "h" in scopes:
        try:
            result = await moonraker.get("/server/history/list", limit=500, order="desc")
            jobs = [j for j in result.get("jobs", []) if j.get("status") == "completed"]
            matched = [
                {
                    "job_id": j["job_id"],
                    "filename": j["filename"],
                    "time": j.get("end_time"),
                    "duration_s": j.get("print_duration", 0),
                }
                for j in jobs
                if q in j.get("filename", "").lower()
            ]
            results["history"] = matched[:10]
        except Exception:
            pass

    if "s" in scopes:
        spools = await db.list_spools()
        results["spools"] = [
            s for s in spools
            if q in s.get("brand", "").lower()
            or q in s.get("material", "").lower()
            or q in s.get("color", "").lower()
        ][:10]

    if "p" in scopes:
        projects = await db.list_projects()
        results["projects"] = [
            p for p in projects
            if q in p.get("name", "").lower()
            or q in (p.get("notes") or "").lower()
        ][:10]

    return results
