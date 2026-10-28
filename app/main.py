import asyncio
import logging
import mimetypes
import os
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app import cache, db, ha, recorder, sse
from app.config import settings
from app.influx import influx
from app.moonraker import moonraker
from app.nordpool import backfill_prices, record_current_price
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
from app.sse import hub

mimetypes.add_type("application/manifest+json", ".webmanifest")

_APP_VERSION = os.getenv("APP_VERSION", "dev")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


async def _price_startup_backfill() -> None:
    """Backfill Nord Pool prices from Dec 2021 up to today if InfluxDB is missing data."""
    await asyncio.sleep(10)  # let the app finish starting first
    oldest = influx.oldest_electricity_price()
    target_start = date(2021, 12, 1)
    if oldest is None or oldest.date() > target_start:
        start = target_start
        end = date.today()
        log.info("nordpool: starting backfill %s → %s", start, end)
        written = await backfill_prices(start, end)
        log.info("nordpool: backfill complete, %d points written", written)
    else:
        # Just fill any recent gap (last 3 days in case of missed updates)
        end = date.today()
        start = end - timedelta(days=3)
        await backfill_prices(start, end)


async def _price_recorder_loop() -> None:
    """Record the current electricity price to InfluxDB every 30 minutes."""
    while True:
        await asyncio.sleep(1800)
        try:
            price = await ha.get_current_price()
            if price > 0:
                await record_current_price(price)
        except Exception as exc:
            log.warning("price recorder error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db(settings.database_path)
    await cache.init()

    sse.register_ws_handlers()
    recorder.register_ws_handlers()

    ws_task = asyncio.create_task(moonraker.connect_ws())
    ha_task = asyncio.create_task(sse._poll_ha())
    pi_task = asyncio.create_task(sse._poll_pi_stats())
    ps_task = asyncio.create_task(sse._poll_printer_state())

    # Full backfill on startup, then quick reconcile every 5 minutes
    asyncio.create_task(recorder.startup_reconcile())
    asyncio.create_task(recorder.periodic_reconcile())
    asyncio.create_task(enrich_existing_links())
    asyncio.create_task(_price_startup_backfill())
    asyncio.create_task(_price_recorder_loop())

    log.info("printer started, db=%s", settings.database_path)
    yield

    moonraker.stop()
    ws_task.cancel()
    ha_task.cancel()
    pi_task.cancel()
    ps_task.cancel()
    influx.close()
    await cache.close()


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


@app.get("/api/version")
async def version():
    return {"version": _APP_VERSION}


@app.get("/stream")
async def stream(request: Request):
    q = hub.subscribe()

    async def generate():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield msg
                except TimeoutError:
                    yield ": ping\n\n"
        finally:
            hub.unsubscribe(q)

    return StreamingResponse(
        generate(),
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
