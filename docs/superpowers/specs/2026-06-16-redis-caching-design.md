# Redis Caching Design

## Overview

Add Redis caching to the FastAPI printer API to reduce response times, primarily for the history endpoint which hits Moonraker (HTTP) + InfluxDB + SQLite per request.

## Architecture

### New module: `app/cache.py`

Thin async wrapper around `redis.asyncio`:

- `init(url)` — create client, called in lifespan startup
- `close()` — called in lifespan shutdown
- `get_or_set(key, fn, ttl)` — fetch from Redis; on miss call `fn()`, store JSON result, return it
- `invalidate(*keys)` — delete specific keys
- `invalidate_prefix(prefix)` — delete all keys matching `prefix*` (used for history pages)

Graceful degradation: all cache operations catch exceptions and fall through to live queries. Redis down = no crash, just slower.

### Configuration

Add `REDIS_URL` to `app/config.py` settings with default `redis://redis:6379`.

### Infrastructure

Add Redis service to `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  restart: unless-stopped
```

No persistence — cache is ephemeral, data sources are authoritative.

## Cache Keys and TTLs

| Endpoint | Key pattern | TTL |
|---|---|---|
| `GET /api/history` (offset=0) | `history:{limit}:0` | 60s |
| `GET /api/history` (offset>0) | `history:{limit}:{offset}` | 86400s (24h) |
| `GET /api/prints/{job_id}` | `print:{job_id}` | 3600s (1h) |
| `GET /api/projects` | `projects:list` | 300s (5min) |
| `GET /api/projects/{id}` | `project:{id}` | 300s (5min) |
| `GET /api/spools` | `spools:list` | 1800s (30min) |

Rationale:
- History offset=0 changes whenever a print completes — short TTL.
- Older history pages are immutable — 24h TTL, expire naturally.
- Print detail for completed prints is immutable unless spool/cost mutated — 1h TTL with explicit invalidation.
- Projects and spools change infrequently — medium TTLs with mutation-triggered invalidation.

## Invalidation Map

| Mutation | Keys invalidated |
|---|---|
| Print job ends (Moonraker WS notify) | all `history:*:0` keys (invalidate_prefix) |
| `PATCH /history/{job_id}/spool` | all `history:*:0` keys, `print:{job_id}` |
| `POST /history/{job_id}/recalculate` | all `history:*:0` keys, `print:{job_id}` |
| `POST /history/{job_id}/restore` | all `history:*:0` keys, `print:{job_id}` |
| `POST /projects/{id}/prints` | `project:{id}`, `print:{job_id}` |
| `DELETE /projects/{id}/prints/{job_id}` | `project:{id}`, `print:{job_id}` |
| Any project mutation (PATCH/DELETE/add file/link/cover) | `projects:list`, `project:{id}` |
| Any spool mutation (create/update/delete) | `spools:list`, `history:*:0` |

Older history pages (offset>0) are not explicitly invalidated on mutations — they rely on 24h TTL expiry. The only data that changes on older pages is spool/cost info, which is already invalidated per `print:{job_id}` key on the detail endpoint.

## Components Changed

- `app/cache.py` — new module
- `app/config.py` — add `REDIS_URL` setting
- `app/main.py` — init/close cache in lifespan; invalidate `history:*:0` on Moonraker print-end notify
- `app/routes/history.py` — wrap `list_history` with cache; invalidate in spool/recalculate/restore mutations
- `app/routes/prints.py` — wrap `get_print_detail` with cache
- `app/routes/projects.py` — wrap `list_projects` and `get_project` with cache; invalidate on mutations
- `app/routes/spools.py` — wrap spool list with cache; invalidate on mutations
- `docker-compose.yml` — add Redis service
- `pyproject.toml` — add `redis[asyncio]` dependency

## Error Handling

Cache errors are caught and logged at WARNING level. The app falls back to live data sources transparently. No user-facing errors from cache failures.
