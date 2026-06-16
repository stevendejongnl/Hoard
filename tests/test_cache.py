import json
from unittest.mock import AsyncMock, patch

import pytest

from app import cache


@pytest.mark.asyncio
async def test_get_or_set_miss_calls_fn_and_stores():
    """On cache miss, fn() is called and result stored in Redis."""
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
    mock_redis = AsyncMock()
    mock_redis.get.side_effect = Exception("connection refused")

    async def fn():
        return {"data": "live"}

    with patch.object(cache, "_redis", mock_redis):
        result = await cache.get_or_set("key:1", fn, ttl=60)

    assert result == {"data": "live"}


@pytest.mark.asyncio
async def test_invalidate_deletes_keys():
    mock_redis = AsyncMock()

    with patch.object(cache, "_redis", mock_redis):
        await cache.invalidate("key:1", "key:2")

    mock_redis.delete.assert_called_once_with("key:1", "key:2")


@pytest.mark.asyncio
async def test_invalidate_prefix_deletes_matching_keys():
    async def mock_scan_iter(pattern):
        for key in ["history:20:0", "history:50:0"]:
            yield key

    mock_redis = AsyncMock()
    mock_redis.scan_iter = mock_scan_iter

    with patch.object(cache, "_redis", mock_redis):
        await cache.invalidate_prefix("history:")

    mock_redis.delete.assert_called_once_with("history:20:0", "history:50:0")


@pytest.mark.asyncio
async def test_invalidate_prefix_noop_when_no_keys():
    async def mock_scan_iter(pattern):
        return
        yield  # make it an async generator

    mock_redis = AsyncMock()
    mock_redis.scan_iter = mock_scan_iter

    with patch.object(cache, "_redis", mock_redis):
        await cache.invalidate_prefix("history:")

    mock_redis.delete.assert_not_called()


@pytest.mark.asyncio
async def test_invalidate_noop_when_redis_none():
    """invalidate() is safe when Redis is not initialized."""
    with patch.object(cache, "_redis", None):
        await cache.invalidate("key:1")  # must not raise
