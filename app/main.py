import asyncio
import logging
import mimetypes
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app import cache, db, home_assistant, recorder, server_sent_events
from app.config import settings
from app.influx import influx
from app.mcp.api_request import InProcessApi
from app.mcp.catalog import build_tool_definitions
from app.mcp.endpoint import create_mcp_router
from app.mcp.server import McpServer
from app.mcp.tokens import parse_registered_clients
from app.moonraker import moonraker
from app.routes import (
    chunks,
    control,
    files,
    history,
    predict,
    prints,
    projects,
    push,
    search,
    spools,
    temperatures,
    webcams,
)
from app.routes.projects import enrich_existing_links
from app.server_sent_events import hub

mimetypes.add_type("application/manifest+json", ".webmanifest")

_APP_VERSION = os.getenv("APP_VERSION", "dev")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


async def _price_recorder_loop() -> None:
    """Record the current electricity price to InfluxDB every 30 minutes."""
    while True:
        await asyncio.sleep(1800)
        try:
            await home_assistant.record_current_price()
        except Exception as exc:
            log.warning("price recorder error: %s", exc)


def _start_background_tasks() -> list[asyncio.Task]:
    """Start the long-running tasks and return the ones that must be cancelled on shutdown."""
    cancellable_tasks = [
        asyncio.create_task(moonraker.connect_ws()),
        asyncio.create_task(server_sent_events._poll_ha()),
        asyncio.create_task(server_sent_events._poll_pi_stats()),
        asyncio.create_task(server_sent_events._poll_printer_state()),
    ]
    # Full backfill on startup, then quick reconcile every 5 minutes
    asyncio.create_task(recorder.startup_reconcile())
    asyncio.create_task(recorder.periodic_reconcile())
    asyncio.create_task(enrich_existing_links())
    asyncio.create_task(_price_recorder_loop())
    return cancellable_tasks


async def _stop_background_tasks(cancellable_tasks: list[asyncio.Task]) -> None:
    moonraker.stop()
    for task in cancellable_tasks:
        task.cancel()
    influx.close()
    await cache.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db(settings.database_path)
    await cache.init()

    server_sent_events.register_ws_handlers()
    recorder.register_ws_handlers()
    cancellable_tasks = _start_background_tasks()

    log.info("Hoard started, db=%s", settings.database_path)
    yield
    await _stop_background_tasks(cancellable_tasks)


app = FastAPI(title="Hoard", lifespan=lifespan)

app.include_router(control.router)
app.include_router(chunks.router)
app.include_router(files.router)
app.include_router(webcams.router)
app.include_router(history.router)
app.include_router(predict.router)
app.include_router(spools.router)
app.include_router(search.router)
app.include_router(projects.router)
app.include_router(prints.router)
app.include_router(push.router)
app.include_router(temperatures.router)


def create_mcp_server() -> McpServer:
    return McpServer(build_tool_definitions(app.openapi()), InProcessApi(app), version=_APP_VERSION)


_mcp_server: McpServer | None = None


def get_mcp_server() -> McpServer:
    global _mcp_server
    if _mcp_server is None:
        _mcp_server = create_mcp_server()
    return _mcp_server


app.include_router(create_mcp_router(get_mcp_server, lambda: parse_registered_clients(settings.mcp_clients)))


@app.get("/api/version")
async def version():
    return {"version": _APP_VERSION}


async def _event_stream(request: Request, queue: asyncio.Queue[str]):
    try:
        while not await request.is_disconnected():
            try:
                yield await asyncio.wait_for(queue.get(), timeout=15.0)
            except TimeoutError:
                yield ": ping\n\n"
    finally:
        hub.unsubscribe(queue)


@app.get("/stream")
async def stream(request: Request):
    return StreamingResponse(
        _event_stream(request, hub.subscribe()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Serve built frontend — real files (PWA manifest/sw.js/icons) served as-is,
# everything else falls back to index.html for client-side routing.
_static = Path(settings.static_dir)
_NO_CACHE_FILES = {"sw.js", "manifest.webmanifest", "index.html"}
if _static.exists():
    app.mount("/assets", StaticFiles(directory=str(_static / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = (_static / full_path).resolve()
        if candidate.is_relative_to(_static.resolve()) and candidate.is_file():
            headers = {"Cache-Control": "no-cache"} if candidate.name in _NO_CACHE_FILES else None
            return FileResponse(candidate, headers=headers)
        return FileResponse(str(_static / "index.html"), headers={"Cache-Control": "no-cache"})
