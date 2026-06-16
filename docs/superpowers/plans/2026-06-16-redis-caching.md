# Redis Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Redis caching with smart invalidation to reduce API response times, primarily for `/api/history` which hits Moonraker + InfluxDB + SQLite on every request.

**Architecture:** A thin `app/cache.py` module wraps `redis.asyncio` and exposes `get_or_set`, `invalidate`, and `invalidate_prefix` helpers. Routes call these helpers directly — no decorators, no magic. Cache is optional: if Redis is unavailable all helpers fall through to live data sources. History offset=0 gets a 60s TTL; older pages get 24h. Mutations explicitly invalidate relevant keys.

**Tech Stack:** `redis[asyncio]` (redis-py async), Redis 7 LTS (`redis:7-alpine`), FastAPI lifespan for init/shutdown.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/cache.py` | Create | Redis client wrapper: `init`, `close`, `get_or_set`, `invalidate`, `invalidate_prefix` |
| `app/config.py` | Modify | Add `redis_url` setting |
| `app/main.py` | Modify | Init/close cache in lifespan; invalidate history on print-end notify |
| `app/routes/history.py` | Modify | Cache `list_history`; invalidate on spool/recalculate/restore mutations |
| `app/routes/prints.py` | Modify | Cache `get_print_detail` |
| `app/routes/projects.py` | Modify | Cache `list_projects` and `get_project`; invalidate on all mutations |
| `app/routes/spools.py` | Modify | Cache `list_spools`; invalidate on create/update/delete |
| `docker-compose.yml` | Modify | Add `redis:7-alpine` service |
| `pyproject.toml` | Modify | Add `redis[asyncio]` dependency |
| `tests/test_cache.py` | Create | Unit tests for cache module (with fake Redis) |

---

### Task 1: Add dependency and Redis service

**Files:**
- Modify: `pyproject.toml`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add redis dependency**

Run:
```bash
uv add "redis[asyncio]>=5.0"
```

Expected output: `pyproject.toml` updated with `redis[asyncio]>=5.0` in `dependencies`.

- [ ] **Step 2: Add Redis service to docker-compose**

In `docker-compose.yml`, add `redis` service and link it to `printer`:

```yaml
services:
  printer:
    build: .
    restart: unless-stopped
    ports:
      - "8765:8765"
    volumes:
      - printer-data:/data
    env_file:
      - .env
    environment:
      DATABASE_PATH: /data/printer.db
      STATIC_DIR: /app/static
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  printer-data:
```

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock docker-compose.yml
git commit -m "chore: add redis dependency and docker-compose service"
```

---

### Task 2: Add REDIS_URL to config

**Files:**
- Modify: `app/config.py`

- [ ] **Step 1: Add redis_url field**

Replace the contents of `app/config.py` with:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    moonraker_url: str = "http://192.168.1.102"
    moonraker_ws: str = "ws://192.168.1.102/websocket"
    ha_url: str = "http://192.168.1.25:8123"
    ha_token: str = ""
    influxdb_url: str = "http://192.168.1.22:8086"
    influxdb_token: str = ""
    influxdb_org: str = "my-org"
    influxdb_bucket: str = "home"
    database_path: str = "/data/printer.db"
    static_dir: str = "static"
    uploads_dir: str = "./uploads"
    redis_url: str = "redis://localhost:6379"

    model_config = {"env_file": ".env"}


settings = Settings()
```

- [ ] **Step 2: Commit**

```bash
git add app/config.py
git commit -m "feat(config): add REDIS_URL setting"
```

---

### Task 3: Create app/cache.py

**Files:**
- Create: `app/cache.py`
- Create: `tests/test_cache.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_cache.py`:

```python
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_get_or_set_miss_calls_fn_and_stores():
    """On cache miss, fn() is called and result stored in Redis."""
    from app import cache

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None  # cache miss

    async def fn():
        return {"data": "value"}

    with patch.object(cache, "_redis", mock_redis):
        result = await cache.get_or_set("key:1", fn, ttl=60)

    assert result == {"data": "value"}
    mock_redis.set.assert_called_once_with("key:1", json.dumps({"data": "value"}), ex=60)


@pytest.mark.asyncio
async def test_get_or_set_hit_returns_cached():
    """On cache hit, fn() is NOT called."""
    from app import cache

    mock_redis = AsyncMock()
    mock_redis.get.return_value = json.dumps({"data": "cached"})

    fn = AsyncMock()

    with patch.object(cache, "_redis", mock_redis):
        result = await cache.get_or_set("key:1", fn, ttl=60)

    assert result == {"data": "cached"}
    fn.assert_not_called()


@pytest.mark.asyncio
async def test_get_or_set_redis_error_falls_through():
    """If Redis raises, fn() is still called and result returned."""
    from app import cache

    mock_redis = AsyncMock()
    mock_redis.get.side_effect = Exception("connection refused")

    async def fn():
        return {"data": "live"}

    with patch.object(cache, "_redis", mock_redis):
        result = await cache.get_or_set("key:1", fn, ttl=60)

    assert result == {"data": "live"}


@pytest.mark.asyncio
async def test_invalidate_deletes_keys():
    from app import cache

    mock_redis = AsyncMock()

    with patch.object(cache, "_redis", mock_redis):
        await cache.invalidate("key:1", "key:2")

    mock_redis.delete.assert_called_once_with("key:1", "key:2")


@pytest.mark.asyncio
async def test_invalidate_prefix_deletes_matching_keys():
    from app import cache

    mock_redis = AsyncMock()
    mock_redis.keys.return_value = [b"history:20:0", b"history:50:0"]

    with patch.object(cache, "_redis", mock_redis):
        await cache.invalidate_prefix("history:")

    mock_redis.keys.assert_called_once_with("history:*")
    mock_redis.delete.assert_called_once_with(b"history:20:0", b"history:50:0")


@pytest.mark.asyncio
async def test_invalidate_prefix_noop_when_no_keys():
    from app import cache

    mock_redis = AsyncMock()
    mock_redis.keys.return_value = []

    with patch.object(cache, "_redis", mock_redis):
        await cache.invalidate_prefix("history:")

    mock_redis.delete.assert_not_called()


@pytest.mark.asyncio
async def test_invalidate_noop_when_redis_none():
    """invalidate() is safe when Redis is not initialized."""
    from app import cache

    with patch.object(cache, "_redis", None):
        await cache.invalidate("key:1")  # must not raise
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_cache.py -v
```

Expected: `ImportError` or `AttributeError` — `app.cache` doesn't exist yet.

- [ ] **Step 3: Create app/cache.py**

```python
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import redis.asyncio as aioredis

from app.config import settings

log = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


async def init() -> None:
    global _redis
    try:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        await _redis.ping()
        log.info("cache: Redis connected at %s", settings.redis_url)
    except Exception as exc:
        log.warning("cache: Redis unavailable, caching disabled: %s", exc)
        _redis = None


async def close() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


async def get_or_set(key: str, fn: Callable[[], Awaitable[Any]], ttl: int) -> Any:
    if _redis is not None:
        try:
            cached = await _redis.get(key)
            if cached is not None:
                return json.loads(cached)
        except Exception as exc:
            log.warning("cache: get failed for %s: %s", key, exc)

    result = await fn()

    if _redis is not None:
        try:
            await _redis.set(key, json.dumps(result), ex=ttl)
        except Exception as exc:
            log.warning("cache: set failed for %s: %s", key, exc)

    return result


async def invalidate(*keys: str) -> None:
    if _redis is None or not keys:
        return
    try:
        await _redis.delete(*keys)
    except Exception as exc:
        log.warning("cache: invalidate failed for %s: %s", keys, exc)


async def invalidate_prefix(prefix: str) -> None:
    if _redis is None:
        return
    try:
        matched = await _redis.keys(f"{prefix}*")
        if matched:
            await _redis.delete(*matched)
    except Exception as exc:
        log.warning("cache: invalidate_prefix failed for %s: %s", prefix, exc)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
uv run pytest tests/test_cache.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/cache.py tests/test_cache.py
git commit -m "feat(cache): add Redis cache module with get_or_set and invalidation"
```

---

### Task 4: Wire cache init/close into app lifespan + print-end invalidation

**Files:**
- Modify: `app/main.py`

The print-end hook is `handle_history_changed` in `app/recorder.py`, called by Moonraker WS `notify_history_changed`. We hook into the lifespan to init/close Redis, and call `cache.invalidate_prefix("history:")` inside `handle_history_changed` after a print is recorded.

- [ ] **Step 1: Add cache import and init/close to lifespan in app/main.py**

In `app/main.py`, add `from app import cache` to imports, then in the `lifespan` function add `await cache.init()` before `yield` and `await cache.close()` after `yield`:

```python
import asyncio
import logging
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
from app.routes import chunks, control, files, history, predict, prints, projects, search, spools, webcams
from app.routes.projects import enrich_existing_links
from app.sse import hub

_APP_VERSION = os.getenv("APP_VERSION", "dev")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


async def _price_startup_backfill() -> None:
    """Backfill Nord Pool prices from Dec 2021 up to today if InfluxDB is missing data."""
    await asyncio.sleep(10)
    oldest = influx.oldest_electricity_price()
    target_start = date(2021, 12, 1)
    if oldest is None or oldest.date() > target_start:
        start = target_start
        end = date.today()
        log.info("nordpool: starting backfill %s → %s", start, end)
        written = await backfill_prices(start, end)
        log.info("nordpool: backfill complete, %d points written", written)
    else:
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


app = FastAPI(title="printer", lifespan=lifespan)

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


_static = Path(settings.static_dir)
if _static.exists():
    app.mount("/assets", StaticFiles(directory=str(_static / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        return FileResponse(str(_static / "index.html"))
```

- [ ] **Step 2: Add cache invalidation to recorder.py on print-end**

In `app/recorder.py`, add `from app import cache` to imports (after the existing `from app import db, ha`), then in `handle_history_changed` add invalidation after `asyncio.create_task(_record_print(job))`:

Find the function:
```python
async def handle_history_changed(params: list[Any]) -> None:
    """Called by Moonraker WS on notify_history_changed."""
    if not params:
        return
    event = params[0] if isinstance(params[0], dict) else {}
    if event.get("action") != "added":
        return
    job = event.get("job", {})
    # Run in background so WS handler returns immediately
    asyncio.create_task(_record_print(job))
```

Replace with:
```python
async def handle_history_changed(params: list[Any]) -> None:
    """Called by Moonraker WS on notify_history_changed."""
    if not params:
        return
    event = params[0] if isinstance(params[0], dict) else {}
    if event.get("action") != "added":
        return
    job = event.get("job", {})
    asyncio.create_task(_record_print(job))
    await cache.invalidate_prefix("history:")
```

- [ ] **Step 3: Run existing tests to confirm nothing broken**

```bash
uv run pytest tests/ -v
```

Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/main.py app/recorder.py
git commit -m "feat(cache): init Redis in lifespan, invalidate history on print-end"
```

---

### Task 5: Cache /api/history

**Files:**
- Modify: `app/routes/history.py`

TTL strategy: `offset=0` → 60s; `offset>0` → 86400s (24h).
Invalidation: `history:*` prefix on spool assign, recalculate, restore.

- [ ] **Step 1: Add cache to list_history**

In `app/routes/history.py`, add `from app import cache` after the existing imports, then wrap `list_history`:

```python
from app import cache, db, ha
```

Replace the `list_history` function signature + body open with a caching wrapper. The full function becomes:

```python
@router.get("")
async def list_history(limit: int = 20, offset: int = 0) -> dict[str, Any]:
    ttl = 60 if offset == 0 else 86400
    cache_key = f"history:{limit}:{offset}"

    async def _fetch() -> dict[str, Any]:
        # Always use Moonraker as the source of truth for print records
        try:
            result = await moonraker.get(
                "/server/history/list",
                limit=limit,
                start=offset,
                order="desc",
            )
            jobs = result.get("jobs", [])
            try:
                totals = await moonraker.get("/server/history/totals")
                total = int(totals.get("job_totals", {}).get("total_jobs", 0))
            except Exception:
                total = offset + len(jobs)
        except Exception:
            jobs = []
            total = 0

        records = [_moonraker_to_record(j) for j in jobs if j.get("status") == "completed"]

        influx_all = influx.query_history(limit=max(500, offset + limit + 100))

        def _influx_minute(iso: str) -> int:
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                return int(dt.timestamp()) // 60
            except Exception:
                return 0

        influx_by_file_minute: dict[tuple[str, int], dict[str, Any]] = {}
        for r in influx_all:
            key = (r.get("filename", ""), _influx_minute(r.get("time", "")))
            influx_by_file_minute[key] = r

        for record in records:
            filename = record["filename"]
            job_id = record["job_id"]

            end_ts = next((j.get("end_time", 0) for j in jobs if j.get("job_id") == job_id), 0) or 0
            record_minute = int(end_ts) // 60
            cost = influx_by_file_minute.get((filename, record_minute))
            if not cost:
                for delta in range(1, 6):
                    cost = influx_by_file_minute.get((filename, record_minute - delta))
                    if cost:
                        break
                    cost = influx_by_file_minute.get((filename, record_minute + delta))
                    if cost:
                        break

            if cost:
                record["avg_watts"] = cost.get("avg_watts")
                record["avg_eur_per_kwh"] = cost.get("avg_eur_per_kwh")
                record["cost_electricity"] = cost.get("cost_electricity")
                record["cost_filament"] = cost.get("cost_filament")
                record["cost_total"] = cost.get("cost_total")
                record["_source"] = "influx"

            ps = await db.get_print_spool(job_id)
            if ps:
                record["spool"] = {
                    "id": ps.get("spool_id"),
                    "brand": ps.get("brand"),
                    "material": ps.get("material"),
                    "color": ps.get("color"),
                    "color_hex": ps.get("color_hex"),
                }

            proj = await db.get_project_for_job(job_id)
            if proj:
                record["project"] = {"id": proj["id"], "name": proj["name"]}

        job_ids = [r["job_id"] for r in records]
        detail_counts = await db.get_print_detail_counts(job_ids)
        for record in records:
            counts = detail_counts.get(record["job_id"], {"has_detail": False, "photo_count": 0})
            record["has_detail"] = counts["has_detail"]
            record["photo_count"] = counts["photo_count"]

        return {"records": records, "total": total, "limit": limit, "offset": offset}

    return await cache.get_or_set(cache_key, _fetch, ttl=ttl)
```

- [ ] **Step 2: Add invalidation to spool assign, recalculate, and restore**

In `assign_spool`, add invalidation at the end before `return`:

```python
    await cache.invalidate_prefix("history:")
    await cache.invalidate(f"print:{job_id}")
    return {"job_id": job_id, "spool_id": body.spool_id}
```

In `recalculate_cost` — already delegates to `assign_spool`, so invalidation is covered automatically.

In `restore_costs`, add before the final `return`:

```python
    await cache.invalidate_prefix("history:")
    await cache.invalidate(f"print:{job_id}")
    log.info(...)
    return {...}
```

- [ ] **Step 3: Run existing tests**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/history.py
git commit -m "feat(cache): cache /api/history with TTL-by-offset strategy"
```

---

### Task 6: Cache /api/prints/{job_id}

**Files:**
- Modify: `app/routes/prints.py`

- [ ] **Step 1: Add cache to get_print_detail**

In `app/routes/prints.py`, add `from app import cache` to imports.

Replace `get_print_detail`:

```python
@router.get("/api/prints/{job_id}")
async def get_print_detail(job_id: str) -> dict[str, Any]:
    async def _fetch() -> dict[str, Any]:
        job_row = await db.get_or_create_print_job(job_id)

        if not job_row.get("gcode_meta"):
            filename = ""
            try:
                job_data = await moonraker.get("/server/history/job", uid=job_id)
                filename = job_data.get("job", {}).get("filename", "")
            except Exception:
                pass
            if filename:
                try:
                    gcode_meta = await extract_gcode_meta(filename)
                    if gcode_meta is not None:
                        await db.update_print_job(job_id, {"gcode_meta": _json.dumps(gcode_meta)})
                        job_row["gcode_meta"] = gcode_meta
                except Exception as exc:
                    log.debug("prints: lazy gcode_meta failed for %s: %s", job_id, exc)

        stats = await _get_job_stats(job_id)
        photos = await db.list_print_photos(job_id)
        proj = await db.get_project_for_job(job_id)
        project = {"id": proj["id"], "name": proj["name"]} if proj else None
        return {**stats, **job_row, "photos": photos, "project": project}

    return await cache.get_or_set(f"print:{job_id}", _fetch, ttl=3600)
```

- [ ] **Step 2: Invalidate print cache on photo upload/delete**

In `upload_photo`, after `return await db.add_print_photo(...)`, add:

```python
    result = await db.add_print_photo(job_id, filename, source="upload")
    await cache.invalidate(f"print:{job_id}")
    return result
```

In `delete_photo`, after `await db.delete_print_photo(photo_id)`, add:

```python
    await db.delete_print_photo(photo_id)
    await cache.invalidate(f"print:{job_id}")
    return {"deleted": photo_id}
```

In `update_print`, after `return await db.update_print_job(...)`:

```python
    result = await db.update_print_job(job_id, data)
    await cache.invalidate(f"print:{job_id}")
    return result
```

- [ ] **Step 3: Run existing tests**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/prints.py
git commit -m "feat(cache): cache /api/prints/{job_id} with 1h TTL"
```

---

### Task 7: Cache /api/projects

**Files:**
- Modify: `app/routes/projects.py`

- [ ] **Step 1: Add cache to list_projects and get_project**

In `app/routes/projects.py`, add `from app import cache` to imports.

Replace `list_projects`:

```python
@router.get("")
async def list_projects() -> list[dict[str, Any]]:
    return await cache.get_or_set("projects:list", db.list_projects, ttl=300)
```

Replace `get_project`:

```python
@router.get("/{project_id}")
async def get_project(project_id: int) -> dict[str, Any]:
    async def _fetch() -> dict[str, Any]:
        project = await db.get_project(project_id)
        if not project:
            raise HTTPException(404, "Project not found")
        return project

    result = await cache.get_or_set(f"project:{project_id}", _fetch, ttl=300)
    if result is None:
        raise HTTPException(404, "Project not found")
    return result
```

- [ ] **Step 2: Add invalidation to all project mutations**

In `create_project`, after `return await db.create_project(body.name)`:

```python
    result = await db.create_project(body.name)
    await cache.invalidate("projects:list")
    return result
```

In `update_project`, after result check:

```python
    result = await db.update_project(project_id, data)
    if not result:
        raise HTTPException(404, "Project not found")
    await cache.invalidate("projects:list", f"project:{project_id}")
    return result
```

In `delete_project`, after `await db.delete_project(project_id)`:

```python
    await db.delete_project(project_id)
    await cache.invalidate("projects:list", f"project:{project_id}")
```

In `add_file`, after `return await db.add_project_file(...)`:

```python
    result = await db.add_project_file(project_id, body.type, body.filename, body.label)
    await cache.invalidate("projects:list", f"project:{project_id}")
    return result
```

In `upload_file`, after `return await db.add_project_file(...)`:

```python
    result = await db.add_project_file(project_id, ext, stored_path, label or file.filename)
    await cache.invalidate("projects:list", f"project:{project_id}")
    return result
```

In `delete_file`, after `await db.delete_project_file(file_id)`:

```python
    await db.delete_project_file(file_id)
    await cache.invalidate("projects:list", f"project:{project_id}")
```

In `add_link`, after `return link`:

```python
    link = await db.add_project_link(project_id, body.url, body.label)
    asyncio.create_task(_enrich_link(project_id, link["id"], body.url))
    await cache.invalidate("projects:list", f"project:{project_id}")
    return link
```

In `delete_link`, after `await db.delete_project_link(link_id)`:

```python
    await db.delete_project_link(link_id)
    await cache.invalidate("projects:list", f"project:{project_id}")
```

In `link_print`, after `return await db.add_project_print(...)`:

```python
    result = await db.add_project_print(
        project_id, body.project_file_id, body.job_id,
        duration_s, filament_g, cost_total,
    )
    await cache.invalidate("projects:list", f"project:{project_id}", f"print:{body.job_id}")
    return result
```

In `unlink_print`, after `await db.delete_project_print(project_id, job_id)`:

```python
    await db.delete_project_print(project_id, job_id)
    await cache.invalidate("projects:list", f"project:{project_id}", f"print:{job_id}")
```

- [ ] **Step 3: Run existing tests**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/projects.py
git commit -m "feat(cache): cache /api/projects with 5min TTL and mutation invalidation"
```

---

### Task 8: Cache /api/spools

**Files:**
- Modify: `app/routes/spools.py`

- [ ] **Step 1: Add cache to list_spools**

In `app/routes/spools.py`, add `from app import cache` to imports.

Replace `list_spools`:

```python
@router.get("")
async def list_spools() -> list[dict[str, Any]]:
    return await cache.get_or_set("spools:list", db.list_spools, ttl=1800)
```

- [ ] **Step 2: Add invalidation to spool mutations**

In `create_spool`, after `return await db.create_spool(body.model_dump())`:

```python
    result = await db.create_spool(body.model_dump())
    await cache.invalidate("spools:list")
    return result
```

In `update_spool`, after `return result` (at the end of the function):

```python
    result = await db.update_spool(spool_id, data)
    if not result:
        raise HTTPException(404, "Spool not found")
    if "cost_per_gram" in data:
        asyncio.create_task(_recalculate_spool_prints(spool_id))
    await cache.invalidate("spools:list")
    await cache.invalidate_prefix("history:")
    return result
```

Replace `delete_spool` body entirely:

```python
@router.delete("/{spool_id}", status_code=204)
async def delete_spool(spool_id: int) -> None:
    ok = await db.delete_spool(spool_id)
    if not ok:
        raise HTTPException(409, "Spool has linked prints — unlink first")
    await cache.invalidate("spools:list")
    await cache.invalidate_prefix("history:")
```

- [ ] **Step 3: Run all tests**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/spools.py
git commit -m "feat(cache): cache /api/spools with 30min TTL and mutation invalidation"
```

---

### Task 9: Verify end-to-end

- [ ] **Step 1: Run full test suite**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS with no warnings about Redis (cache init is graceful when Redis absent).

- [ ] **Step 2: Run type checking**

```bash
uv run mypy app/
```

Expected: no new errors.

- [ ] **Step 3: Run linter**

```bash
uv run ruff check app/ tests/
```

Expected: no errors.

- [ ] **Step 4: Commit any fixes, then final commit**

```bash
git add -p
git commit -m "chore: fix lint/type issues from Redis caching"
```
