from httpx import AsyncClient

from app.auto_power_off import AutoPowerOffStatus
from app.routes.dependencies import provide_auto_power_off
from tests.route_fakes import override_provider


class FakeAutoPowerOff:
    def __init__(self, status: AutoPowerOffStatus = AutoPowerOffStatus(enabled=True, off_at=None)) -> None:
        self._status = status
        self.postponed: list[float] = []
        self.canceled = 0

    def status(self) -> AutoPowerOffStatus:
        return self._status

    def postpone(self, seconds: float) -> None:
        self.postponed.append(seconds)

    def cancel(self) -> None:
        self.canceled += 1


async def test_the_settings_and_the_time_of_the_power_off_are_shown(client: AsyncClient, monkeypatch):
    override_provider(
        monkeypatch, provide_auto_power_off, FakeAutoPowerOff(AutoPowerOffStatus(enabled=True, off_at=1234.0))
    )
    body = (await client.get("/api/control/auto-power-off")).json()
    assert body == {"enabled": True, "idle_minutes": 30, "off_at": 1234.0}


async def test_the_idle_time_and_the_switch_are_changed_and_kept(client: AsyncClient, monkeypatch):
    override_provider(monkeypatch, provide_auto_power_off, FakeAutoPowerOff())
    response = await client.put("/api/control/auto-power-off", json={"idle_minutes": 15, "enabled": False})
    assert response.json()["idle_minutes"] == 15
    body = (await client.get("/api/control/auto-power-off")).json()
    assert (body["idle_minutes"], body["enabled"]) == (15, False)


async def test_an_idle_time_that_makes_no_sense_is_a_422_with_the_reason(client: AsyncClient, monkeypatch):
    override_provider(monkeypatch, provide_auto_power_off, FakeAutoPowerOff())
    response = await client.put("/api/control/auto-power-off", json={"idle_minutes": 0})
    assert response.status_code == 422
    assert "between 1 minute and 24 hours" in str(response.json())


async def test_postponing_keeps_the_power_on_for_the_given_minutes(client: AsyncClient, monkeypatch):
    fake = FakeAutoPowerOff()
    override_provider(monkeypatch, provide_auto_power_off, fake)
    assert (await client.post("/api/control/auto-power-off/postpone", json={"minutes": 60})).status_code == 200
    assert fake.postponed == [3600]


async def test_postponing_for_no_time_or_more_than_a_day_is_a_422(client: AsyncClient, monkeypatch):
    override_provider(monkeypatch, provide_auto_power_off, FakeAutoPowerOff())
    for minutes in (0, 1441):
        response = await client.post("/api/control/auto-power-off/postpone", json={"minutes": minutes})
        assert response.status_code == 422


async def test_canceling_keeps_the_power_on_until_the_printer_has_been_busy(client: AsyncClient, monkeypatch):
    fake = FakeAutoPowerOff()
    override_provider(monkeypatch, provide_auto_power_off, fake)
    assert (await client.post("/api/control/auto-power-off/cancel")).status_code == 200
    assert fake.canceled == 1
