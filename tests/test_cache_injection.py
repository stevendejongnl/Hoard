import json

from app import cache


class FakeRedis:
    def __init__(self, stored: dict[str, str] | None = None, failing: bool = False):
        self.stored = stored or {}
        self.failing = failing
        self.expirations: dict[str, int] = {}
        self.pinged = False

    async def ping(self):
        self.pinged = True

    async def get(self, key):
        if self.failing:
            raise ConnectionError("down")
        return self.stored.get(key)

    async def set(self, key, value, ex=None):
        if self.failing:
            raise ConnectionError("down")
        self.stored[key] = value
        self.expirations[key] = ex

    async def delete(self, *keys):
        for key in keys:
            self.stored.pop(key, None)

    async def scan_iter(self, pattern):
        prefix = pattern.rstrip("*")
        for key in list(self.stored):
            if key.startswith(prefix):
                yield key


async def never_called():
    raise AssertionError("the producer must not run on a cache hit")


async def test_get_or_set_stores_the_result_on_the_injected_client():
    fake = FakeRedis()

    async def produce():
        return {"a": 1}

    assert await cache.get_or_set("key", produce, ttl=30, client=fake) == {"a": 1}
    assert json.loads(fake.stored["key"]) == {"a": 1}
    assert fake.expirations["key"] == 30


async def test_get_or_set_returns_the_cached_value_of_the_injected_client():
    fake = FakeRedis({"key": json.dumps([1, 2])})
    assert await cache.get_or_set("key", never_called, ttl=30, client=fake) == [1, 2]


async def test_get_or_set_still_produces_and_tries_to_store_when_the_client_fails():
    fake = FakeRedis(failing=True)

    async def produce():
        return "live"

    assert await cache.get_or_set("key", produce, ttl=30, client=fake) == "live"


async def test_get_or_set_treats_unreadable_cached_json_as_a_miss():
    fake = FakeRedis({"key": "{not json"})

    async def produce():
        return "fresh"

    assert await cache.get_or_set("key", produce, ttl=30, client=fake) == "fresh"
    assert json.loads(fake.stored["key"]) == "fresh"


async def test_invalidate_and_invalidate_prefix_use_the_injected_client():
    fake = FakeRedis({"history:1": "1", "history:2": "2", "other": "3"})
    await cache.invalidate("other", client=fake)
    await cache.invalidate_prefix("history:", client=fake)
    assert fake.stored == {}


async def test_init_connects_with_the_injected_factory_and_pings():
    fake = FakeRedis()
    received: list[tuple] = []

    def connect(url, **options):
        received.append((url, options))
        return fake

    await cache.init(url="redis://example:1", connect=connect)
    try:
        assert received == [("redis://example:1", {"decode_responses": True})]
        assert fake.pinged
    finally:
        cache._redis = None


async def test_init_disables_caching_when_the_connection_fails():
    def connect(url, **options):
        raise ConnectionError("refused")

    await cache.init(url="redis://example:1", connect=connect)
    assert cache._redis is None
