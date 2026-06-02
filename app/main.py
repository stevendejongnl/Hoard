import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routes import files, history, predict, spools

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app import db, recorder, sse
    from app.moonraker import moonraker

    await db.init_db(settings.database_path)

    sse.register_ws_handlers()
    recorder.register_ws_handlers()

    ws_task = asyncio.create_task(moonraker.connect_ws())
    ha_task = asyncio.create_task(sse._poll_ha())
    pi_task = asyncio.create_task(sse._poll_pi_stats())

    log.info("printer started, db=%s", settings.database_path)
    yield

    moonraker.stop()
    ws_task.cancel()
    ha_task.cancel()
    pi_task.cancel()
    from app.influx import influx
    influx.close()


app = FastAPI(title="printer", lifespan=lifespan)

app.include_router(files.router)
app.include_router(history.router)
app.include_router(predict.router)
app.include_router(spools.router)


@app.get("/stream")
async def stream(request: Request):
    from app.sse import hub

    q = hub.subscribe()

    async def generate():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield msg
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            hub.unsubscribe(q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Serve built frontend — fallback to index.html for client-side routing
_static = Path(settings.static_dir)
if _static.exists():
    app.mount("/assets", StaticFiles(directory=str(_static / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        return FileResponse(str(_static / "index.html"))
