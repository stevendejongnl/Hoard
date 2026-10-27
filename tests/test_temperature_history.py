import pytest
from httpx import AsyncClient

from app.main import app
from app.routes.temperatures import read_temperature_store


def create_store(sample_count: int) -> dict:
    """One sample per second like Moonraker, the newest last; the value of each sample is its age in seconds."""
    ages = [sample_count - 1 - index for index in range(sample_count)]
    return {
        "extruder": {
            "temperatures": [200.0 + age for age in ages],
            "targets": [205.0] * sample_count,
            "powers": [0.5] * sample_count,
        },
        "heater_bed": {"temperatures": [60.0 + age for age in ages], "targets": [60.0] * sample_count},
    }


class FakeTemperatureStore:
    def __init__(self, store: dict | None = None, error: Exception | None = None):
        self.store = store
        self.error = error

    async def __call__(self) -> dict:
        if self.error:
            raise self.error
        return self.store


@pytest.fixture
def use_store():
    def install(fake: FakeTemperatureStore) -> None:
        app.dependency_overrides[read_temperature_store] = fake

    yield install
    app.dependency_overrides.pop(read_temperature_store, None)


@pytest.mark.asyncio
async def test_history_lists_samples_oldest_first_with_their_age(client: AsyncClient, use_store):
    use_store(FakeTemperatureStore(create_store(61)))
    response = await client.get("/api/temperatures/history?seconds=60&interval=20")
    assert response.status_code == 200
    ages = [sample["age_seconds"] for sample in response.json()["samples"]]
    assert ages == [60, 40, 20, 0]


@pytest.mark.asyncio
async def test_history_sample_carries_actual_and_target_temperatures(client: AsyncClient, use_store):
    use_store(FakeTemperatureStore(create_store(11)))
    response = await client.get("/api/temperatures/history?seconds=10&interval=10")
    assert response.json()["samples"][0] == {
        "age_seconds": 10,
        "hotend_actual": 210.0,
        "hotend_target": 205.0,
        "bed_actual": 70.0,
        "bed_target": 60.0,
    }


@pytest.mark.asyncio
async def test_history_leaves_out_samples_older_than_the_requested_window(client: AsyncClient, use_store):
    use_store(FakeTemperatureStore(create_store(100)))
    response = await client.get("/api/temperatures/history?seconds=30&interval=10")
    ages = [sample["age_seconds"] for sample in response.json()["samples"]]
    assert max(ages) == 30


@pytest.mark.asyncio
async def test_history_is_empty_when_the_printer_has_no_heaters_in_the_store(client: AsyncClient, use_store):
    use_store(FakeTemperatureStore({}))
    response = await client.get("/api/temperatures/history")
    assert response.json() == {"samples": []}


@pytest.mark.asyncio
async def test_history_defaults_to_ten_minutes_every_five_seconds(client: AsyncClient, use_store):
    use_store(FakeTemperatureStore(create_store(1200)))
    samples = (await client.get("/api/temperatures/history")).json()["samples"]
    assert len(samples) == 121
    assert samples[0]["age_seconds"] == 600


@pytest.mark.asyncio
async def test_history_reports_a_bad_gateway_when_moonraker_fails(client: AsyncClient, use_store):
    use_store(FakeTemperatureStore(error=RuntimeError("offline")))
    response = await client.get("/api/temperatures/history")
    assert response.status_code == 502


@pytest.mark.asyncio
async def test_history_rejects_a_window_that_is_not_positive(client: AsyncClient, use_store):
    use_store(FakeTemperatureStore(create_store(10)))
    response = await client.get("/api/temperatures/history?seconds=0")
    assert response.status_code == 422
