from types import ModuleType
from typing import Any

from fastapi import APIRouter

from app.moonraker import MoonrakerClient
from app.routes.dependencies import Database, Moonraker

router = APIRouter(prefix="/api/search", tags=["search"])


_SCOPE_LETTERS = {"h", "s", "p"}


def _parse_scopes(scope: str) -> set[str]:
    return {item.strip() for item in scope.split(",")} if scope != "all" else set(_SCOPE_LETTERS)


def _match_history(result: dict[str, Any], query: str) -> list[dict[str, Any]]:
    jobs = [job for job in result.get("jobs", []) if job.get("status") == "completed"]
    matched = [
        {
            "job_id": job["job_id"],
            "filename": job["filename"],
            "time": job.get("end_time"),
            "duration_s": job.get("print_duration", 0),
        }
        for job in jobs
        if query in job.get("filename", "").lower()
    ]
    return matched[:10]


async def _search_history(moonraker: MoonrakerClient, query: str) -> list[dict[str, Any]]:
    """Completed prints whose file name contains the query; a printer that fails has no history."""
    try:
        return _match_history(await moonraker.get("/server/history/list", limit=500, order="desc"), query)
    except Exception:
        return []


async def _search_spools(database: ModuleType, query: str) -> list[dict[str, Any]]:
    spools = await database.list_spools()
    matching = [
        spool
        for spool in spools
        if query in spool.get("brand", "").lower()
        or query in spool.get("material", "").lower()
        or query in spool.get("color", "").lower()
    ]
    return matching[:10]


async def _search_projects(database: ModuleType, query: str) -> list[dict[str, Any]]:
    projects = await database.list_projects()
    matching = [
        project
        for project in projects
        if query in project.get("name", "").lower() or query in (project.get("notes") or "").lower()
    ]
    return matching[:10]


@router.get("")
async def search(moonraker: Moonraker, database: Database, q: str = "", scope: str = "all") -> dict[str, Any]:
    """Search across history, spools and projects.

    scope: comma-separated list of 'h', 's', 'p' or 'all'
    """
    query = q.strip().lower()
    scopes = _parse_scopes(scope)
    results: dict[str, list[dict[str, Any]]] = {"history": [], "spools": [], "projects": []}
    if not query:
        return results
    if "h" in scopes:
        results["history"] = await _search_history(moonraker, query)
    if "s" in scopes:
        results["spools"] = await _search_spools(database, query)
    if "p" in scopes:
        results["projects"] = await _search_projects(database, query)
    return results
