import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import redis.asyncio as aioredis

from app.config import settings

log = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


async def init(
    url: str | None = None,
    connect: Callable[..., aioredis.Redis] = aioredis.from_url,
) -> None:
    global _redis
    redis_url = settings.redis_url if url is None else url
    try:
        _redis = connect(redis_url, decode_responses=True)
        await _redis.ping()
        log.info("cache: Redis connected at %s", redis_url)
    except Exception as exc:
        log.warning("cache: Redis unavailable, caching disabled: %s", exc)
        _redis = None


async def close() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


def _client_or_default(client: aioredis.Redis | None) -> aioredis.Redis | None:
    return _redis if client is None else client


async def _read_cached(client: aioredis.Redis | None, key: str) -> tuple[bool, Any]:
    """Return (hit, value); a missing client or a failing Redis is a miss."""
    if client is None:
        return False, None
    try:
        cached = await client.get(key)
        if cached is None:
            return False, None
        return True, json.loads(cached)
    except Exception as exc:
        log.warning("cache: get failed for %s: %s", key, exc)
        return False, None


async def _write_cached(client: aioredis.Redis | None, key: str, value: Any, ttl: int) -> None:
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value), ex=ttl)
    except Exception as exc:
        log.warning("cache: set failed for %s: %s", key, exc)


async def get_or_set(
    key: str, load: Callable[[], Awaitable[Any]], ttl: int, client: aioredis.Redis | None = None
) -> Any:
    active_client = _client_or_default(client)
    hit, cached = await _read_cached(active_client, key)
    if hit:
        return cached
    result = await load()
    await _write_cached(active_client, key, result, ttl)
    return result


async def invalidate(*keys: str, client: aioredis.Redis | None = None) -> None:
    active_client = _client_or_default(client)
    if active_client is None or not keys:
        return
    try:
        await active_client.delete(*keys)
    except Exception as exc:
        log.warning("cache: invalidate failed for %s: %s", keys, exc)


async def invalidate_prefix(prefix: str, client: aioredis.Redis | None = None) -> None:
    active_client = _client_or_default(client)
    if active_client is None:
        return
    try:
        keys = [key async for key in active_client.scan_iter(f"{prefix}*")]
        if keys:
            await active_client.delete(*keys)
    except Exception as exc:
        log.warning("cache: invalidate_prefix failed for %s: %s", prefix, exc)
