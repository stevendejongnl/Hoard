import asyncio
import functools
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Concatenate, cast

from influxdb_client import InfluxDBClient, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

from app.config import settings


def run_in_thread[**Parameters, Result](
    method: Callable[Concatenate["InfluxClient", Parameters], Result],
) -> Callable[Concatenate["InfluxClient", Parameters], Awaitable[Result]]:
    """Makes a method that blocks on InfluxDB awaitable, so it runs on a worker thread and the event loop is free."""

    @functools.wraps(method)
    async def run(self: "InfluxClient", *arguments: Parameters.args, **keywords: Parameters.kwargs) -> Result:
        return await asyncio.to_thread(method, self, *arguments, **keywords)

    return run


def _escape_tag(value: str) -> str:
    return value.replace(" ", r"\ ").replace(",", r"\,").replace("=", r"\=")


def _print_job_tags(filename: str, spool_id: int | None, material: str | None, job_id: str | None) -> dict[str, str]:
    tags: dict[str, str] = {"filename": filename}
    if spool_id is not None:
        tags["spool_id"] = str(spool_id)
    if material:
        tags["material"] = material
    if job_id:
        tags["job_id"] = job_id
    return tags


def _row_from_record(record: Any) -> dict[str, Any]:
    row = dict(record.values)
    row["time"] = record.get_time().isoformat().replace("+00:00", "Z")
    for tag in ("filename", "spool_id", "material"):
        if tag not in row:
            row[tag] = record.values.get(tag)
    return row


class InfluxClient:
    def __init__(self, app_settings: Any = settings, connection: Any = None) -> None:
        self._client = connection or InfluxDBClient(
            url=app_settings.influxdb_url,
            token=app_settings.influxdb_token,
            org=app_settings.influxdb_org,
        )
        self._write = self._client.write_api(write_options=SYNCHRONOUS)
        self._bucket = app_settings.influxdb_bucket
        self._org = app_settings.influxdb_org

    @run_in_thread
    def write_print_job(
        self,
        *,
        timestamp: datetime,
        filename: str,
        spool_id: int | None,
        material: str | None,
        duration_s: float,
        filament_g: float,
        avg_watts: float,
        avg_eur_per_kwh: float,
        cost_electricity: float,
        cost_filament: float,
        cost_total: float,
        job_id: str | None = None,
    ) -> None:
        tags = _print_job_tags(filename, spool_id, material, job_id)
        tag_str = ",".join(f"{_escape_tag(key)}={_escape_tag(value)}" for key, value in tags.items())
        fields = (
            f"duration_s={duration_s},"
            f"filament_g={filament_g},"
            f"avg_watts={avg_watts},"
            f"avg_eur_per_kwh={avg_eur_per_kwh},"
            f"cost_electricity={cost_electricity},"
            f"cost_filament={cost_filament},"
            f"cost_total={cost_total}"
        )
        ts = int(timestamp.timestamp())
        line = f"print_job,{tag_str} {fields} {ts}"
        self._write.write(
            bucket=self._bucket, org=self._org, record=line, write_precision=cast(WritePrecision, WritePrecision.S)
        )

    @run_in_thread
    def delete_print_job(self, timestamp: datetime, filename: str) -> None:
        """Delete the InfluxDB entry for one specific print (±10 min window around its end time)."""
        delete_api = self._client.delete_api()
        start = timestamp - timedelta(minutes=10)
        stop = timestamp + timedelta(minutes=10)
        safe = filename.replace("\\", "\\\\").replace('"', '\\"')
        predicate = f'_measurement="print_job" AND filename="{safe}"'
        delete_api.delete(start, stop, predicate, bucket=self._bucket, org=self._org)

    @run_in_thread
    def query_history(self, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
        flux = f"""
from(bucket: "{self._bucket}")
  |> range(start: -3650d)
  |> filter(fn: (r) => r._measurement == "print_job")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: {limit}, offset: {offset})
"""
        try:
            tables = self._client.query_api().query(flux, org=self._org)
        except Exception:
            return []
        results: list[dict[str, Any]] = []
        for table in tables:
            results.extend(_row_from_record(record) for record in table.records)
        return results

    @run_in_thread
    def query_by_end_time(self, filename: str, end_time_s: float) -> dict[str, Any] | None:
        """Find the InfluxDB record for a specific print using filename + end timestamp (±5 min)."""
        dt = datetime.fromtimestamp(end_time_s, tz=UTC)
        start = (dt - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        stop = (dt + timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        safe = filename.replace("\\", "\\\\").replace('"', '\\"')
        flux = f"""
from(bucket: "{self._bucket}")
  |> range(start: {start}, stop: {stop})
  |> filter(fn: (r) => r._measurement == "print_job" and r.filename == "{safe}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> limit(n: 1)
"""
        try:
            tables = self._client.query_api().query(flux, org=self._org)
            for table in tables:
                for record in table.records:
                    return _row_from_record(record)
        except Exception:
            pass
        return None

    @run_in_thread
    def count_history(self) -> int:
        flux = f"""
from(bucket: "{self._bucket}")
  |> range(start: -3650d)
  |> filter(fn: (r) => r._measurement == "print_job" and r._field == "cost_total")
  |> count()
"""
        try:
            tables = self._client.query_api().query(flux, org=self._org)
            for table in tables:
                for record in table.records:
                    return int(record.get_value())
        except Exception:
            pass
        return 0

    @run_in_thread
    def write_electricity_price(self, timestamp: datetime, price_eur_per_kwh: float) -> None:
        """Write a single electricity price data point to InfluxDB."""
        ts = int(timestamp.timestamp())
        line = f"electricity_price price={price_eur_per_kwh} {ts}"
        self._write.write(
            bucket=self._bucket,
            org=self._org,
            record=line,
            write_precision=cast(WritePrecision, WritePrecision.S),
        )

    @run_in_thread
    def query_avg_price_between(self, start: datetime, end: datetime) -> float | None:
        """Return time-weighted average electricity price (€/kWh) for a window.

        Returns None if no data exists in InfluxDB for this period.
        """
        start_s = start.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_s = end.strftime("%Y-%m-%dT%H:%M:%SZ")
        flux = f"""
from(bucket: "{self._bucket}")
  |> range(start: {start_s}, stop: {end_s})
  |> filter(fn: (r) => r._measurement == "electricity_price" and r._field == "price")
  |> mean()
"""
        try:
            tables = self._client.query_api().query(flux, org=self._org)
            for table in tables:
                for record in table.records:
                    val = record.get_value()
                    if val is not None:
                        return float(val)
        except Exception:
            pass
        return None

    @run_in_thread
    def oldest_electricity_price(self) -> datetime | None:
        """Return the timestamp of the oldest electricity price in InfluxDB."""
        flux = f"""
from(bucket: "{self._bucket}")
  |> range(start: -3650d)
  |> filter(fn: (r) => r._measurement == "electricity_price" and r._field == "price")
  |> first()
"""
        try:
            tables = self._client.query_api().query(flux, org=self._org)
            for table in tables:
                for record in table.records:
                    return record.get_time()
        except Exception:
            pass
        return None

    def close(self) -> None:
        self._client.close()


influx = InfluxClient()
