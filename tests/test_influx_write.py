from datetime import UTC, datetime
from typing import Any

from app.influx import InfluxClient


class RecordingWriteApi:
    def __init__(self) -> None:
        self.writes: list[dict[str, Any]] = []

    def write(self, **keywords: Any) -> None:
        self.writes.append(keywords)


def create_client() -> tuple[InfluxClient, RecordingWriteApi]:
    client = InfluxClient()
    write_api = RecordingWriteApi()
    client._write = write_api
    return client, write_api


PRINT = {
    "timestamp": datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC),
    "filename": "my part,v2=final.gcode",
    "spool_id": 7,
    "material": "PLA",
    "duration_s": 3600.0,
    "filament_g": 10.0,
    "avg_watts": 500.0,
    "avg_eur_per_kwh": 0.3,
    "cost_electricity": 0.15,
    "cost_filament": 0.2,
    "cost_total": 0.35,
    "job_id": "abc",
}

FIELDS = (
    "duration_s=3600.0,filament_g=10.0,avg_watts=500.0,avg_eur_per_kwh=0.3,"
    "cost_electricity=0.15,cost_filament=0.2,cost_total=0.35"
)


async def test_a_print_job_is_written_as_one_line_with_escaped_tags() -> None:
    client, write_api = create_client()
    await client.write_print_job(**PRINT)
    ((write,),) = [(write,) for write in write_api.writes]
    expected_tags = r"filename=my\ part\,v2\=final.gcode,spool_id=7,material=PLA,job_id=abc"
    assert write["record"] == f"print_job,{expected_tags} {FIELDS} {int(PRINT['timestamp'].timestamp())}"
    assert write["bucket"] == client._bucket
    assert write["org"] == client._org


class FakeRecord:
    def __init__(self, values: dict[str, Any]) -> None:
        self.values = values

    def get_time(self) -> datetime:
        return datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)


class FakeQueryApi:
    def __init__(self, records: list[FakeRecord]) -> None:
        self.tables = [type("Table", (), {"records": records})()]

    def query(self, flux: str, org: str | None = None) -> list:
        return self.tables


class FakeConnection:
    def __init__(self, query_api: FakeQueryApi) -> None:
        self._query_api = query_api

    def write_api(self, write_options: Any) -> RecordingWriteApi:
        return RecordingWriteApi()

    def query_api(self) -> FakeQueryApi:
        return self._query_api


async def test_a_history_row_gets_an_iso_time_and_the_missing_tags_as_none() -> None:
    records = [FakeRecord({"filename": "a.gcode", "cost_total": 1.5})]
    client = InfluxClient(connection=FakeConnection(FakeQueryApi(records)))
    rows = await client.query_history(limit=5)
    assert rows == [
        {"filename": "a.gcode", "cost_total": 1.5, "time": "2026-01-02T03:04:05Z", "spool_id": None, "material": None}
    ]
    assert await client.query_by_end_time("a.gcode", 0) == rows[0]


async def test_a_print_job_without_spool_material_or_job_id_has_only_the_filename_tag() -> None:
    client, write_api = create_client()
    await client.write_print_job(**(PRINT | {"spool_id": None, "material": None, "job_id": None}))
    assert write_api.writes[0]["record"].startswith("print_job,filename=my\\ part\\,v2\\=final.gcode ")
