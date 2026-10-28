import importlib.util
from datetime import UTC, datetime

from app import ha
from app.config import Settings, settings
from app.routes import control


def configure(monkeypatch, **names: str) -> None:
    for name, value in names.items():
        monkeypatch.setattr(settings, name, value)


class FakeInflux:
    def __init__(self, average_price: float | None = None) -> None:
        self.average_price = average_price
        self.written: list[tuple[datetime, float]] = []

    def query_avg_price_between(self, start, end):
        return self.average_price

    def write_electricity_price(self, moment: datetime, price: float) -> None:
        self.written.append((moment, price))


def test_the_sensors_and_the_switch_have_defaults_for_a_plain_setup(monkeypatch) -> None:
    for name in ("HA_POWER_SENSOR", "HA_PRICE_SENSOR", "HA_POWER_SWITCH", "HA_ENERGY_SENSORS"):
        monkeypatch.delenv(name, raising=False)
    defaults = Settings(_env_file=None)
    assert defaults.ha_power_sensor == "sensor.3d_printer_power"
    assert defaults.ha_price_sensor == "sensor.electricity_price_all_in"
    assert defaults.ha_power_switch == "switch.3d_printer"
    assert defaults.ha_energy_sensors == "sensor.3d_printer_energy"


def test_the_names_come_from_the_environment(monkeypatch) -> None:
    monkeypatch.setenv("HA_POWER_SENSOR", "sensor.plug_power")
    monkeypatch.setenv("HA_PRICE_SENSOR", "sensor.tariff")
    monkeypatch.setenv("HA_POWER_SWITCH", "switch.plug")
    monkeypatch.setenv("HA_ENERGY_SENSORS", "sensor.plug_energy")
    mapped = Settings(_env_file=None)
    assert (mapped.ha_power_sensor, mapped.ha_price_sensor) == ("sensor.plug_power", "sensor.tariff")
    assert (mapped.ha_power_switch, mapped.ha_energy_sensors) == ("switch.plug", "sensor.plug_energy")


def test_the_energy_sensors_are_a_comma_separated_list_oldest_first(monkeypatch) -> None:
    configure(monkeypatch, ha_energy_sensors=" sensor.old_plug , sensor.new_plug ,, ")
    assert ha.energy_sensor_ids() == ["sensor.old_plug", "sensor.new_plug"]


async def test_the_current_power_is_read_from_the_configured_sensor(monkeypatch) -> None:
    asked: list[str] = []

    async def fake_state(entity_id: str) -> dict:
        asked.append(entity_id)
        return {"state": "112.5"}

    configure(monkeypatch, ha_power_sensor="sensor.plug_power")
    monkeypatch.setattr(ha, "get_state", fake_state)
    assert await ha.get_current_power() == 112.5
    assert asked == ["sensor.plug_power"]


async def test_the_current_price_is_read_from_the_configured_sensor(monkeypatch) -> None:
    asked: list[str] = []

    async def fake_state(entity_id: str) -> dict:
        asked.append(entity_id)
        return {"state": "0.27"}

    configure(monkeypatch, ha_price_sensor="sensor.tariff")
    monkeypatch.setattr(ha, "get_state", fake_state)
    assert await ha.get_current_price() == 0.27
    assert asked == ["sensor.tariff"]


async def test_the_power_history_is_read_from_the_configured_sensor(monkeypatch) -> None:
    asked: list[str] = []

    async def fake_history(entity_id: str, start, end) -> list:
        asked.append(entity_id)
        return []

    configure(monkeypatch, ha_power_sensor="sensor.plug_power")
    monkeypatch.setattr(ha, "get_history", fake_history)
    await ha.avg_power_over(datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 2, tzinfo=UTC))
    assert asked == ["sensor.plug_power"]


async def test_the_price_history_is_read_from_the_configured_sensor_when_influx_has_none(monkeypatch) -> None:
    asked: list[str] = []

    async def fake_history(entity_id: str, start, end) -> list:
        asked.append(entity_id)
        return []

    configure(monkeypatch, ha_price_sensor="sensor.tariff")
    monkeypatch.setattr(ha, "get_history", fake_history)
    monkeypatch.setattr(ha, "influx", FakeInflux(average_price=None))
    await ha.avg_price_over(datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 2, tzinfo=UTC))
    assert asked == ["sensor.tariff"]


async def test_the_energy_statistics_ask_for_the_configured_sensors(monkeypatch) -> None:
    asked: list[list[str]] = []

    async def fake_statistics(statistic_ids: list[str], start, end) -> dict:
        asked.append(statistic_ids)
        return {}

    configure(monkeypatch, ha_energy_sensors="sensor.old_plug,sensor.new_plug")
    monkeypatch.setattr(ha, "_ws_statistics_during_period", fake_statistics)
    assert await ha.energy_used_kwh(datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 2, tzinfo=UTC)) is None
    assert asked == [["sensor.old_plug", "sensor.new_plug"]]


async def test_the_power_switch_is_the_configured_one(monkeypatch) -> None:
    switched: list[tuple[str, str, str]] = []

    async def fake_service(domain: str, service: str, entity_id: str) -> None:
        switched.append((domain, service, entity_id))

    configure(monkeypatch, ha_power_switch="switch.plug")
    monkeypatch.setattr(control, "_ha_service", fake_service)
    await control.power_on()
    await control.power_off()
    assert switched == [("switch", "turn_on", "switch.plug"), ("switch", "turn_off", "switch.plug")]


async def test_the_current_price_is_recorded_in_influx_when_it_is_known(monkeypatch) -> None:
    fake_influx = FakeInflux()

    async def fake_price() -> float:
        return 0.21

    monkeypatch.setattr(ha, "influx", fake_influx)
    monkeypatch.setattr(ha, "get_current_price", fake_price)
    await ha.record_current_price()
    assert [price for _moment, price in fake_influx.written] == [0.21]


async def test_nothing_is_recorded_when_the_price_is_unknown(monkeypatch) -> None:
    fake_influx = FakeInflux()

    async def no_price() -> float:
        return 0.0

    monkeypatch.setattr(ha, "influx", fake_influx)
    monkeypatch.setattr(ha, "get_current_price", no_price)
    await ha.record_current_price()
    assert fake_influx.written == []


def test_the_nord_pool_backfill_is_gone() -> None:
    assert importlib.util.find_spec("app.nordpool") is None
