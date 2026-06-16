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
