from datetime import datetime, timezone
from typing import Any

from influxdb_client import InfluxDBClient, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

from app.config import settings


class InfluxClient:
    def __init__(self) -> None:
        self._client = InfluxDBClient(
            url=settings.influxdb_url,
            token=settings.influxdb_token,
            org=settings.influxdb_org,
        )
        self._write = self._client.write_api(write_options=SYNCHRONOUS)
        self._bucket = settings.influxdb_bucket
        self._org = settings.influxdb_org

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
    ) -> None:
        tags: dict[str, str] = {"filename": filename}
        if spool_id is not None:
            tags["spool_id"] = str(spool_id)
        if material:
            tags["material"] = material

        tag_str = ",".join(f"{k}={v}" for k, v in tags.items())
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
        self._write.write(bucket=self._bucket, org=self._org, record=line, write_precision=WritePrecision.S)

    def delete_print_job(self, timestamp: datetime, filename: str) -> None:
        delete_api = self._client.delete_api()
        start = datetime(2000, 1, 1, tzinfo=timezone.utc)
        stop = datetime(2100, 1, 1, tzinfo=timezone.utc)
        predicate = f'_measurement="print_job" AND filename="{filename}"'
        delete_api.delete(start, stop, predicate, bucket=self._bucket, org=self._org)

    def query_history(self, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
        flux = f"""
from(bucket: "{self._bucket}")
  |> range(start: -365d)
  |> filter(fn: (r) => r._measurement == "print_job")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: {limit}, offset: {offset})
"""
        try:
            tables = self._client.query_api().query(flux, org=self._org)
        except Exception:
            return []
        results = []
        for table in tables:
            for record in table.records:
                row = dict(record.values)
                row["time"] = record.get_time().isoformat().replace("+00:00", "Z")
                # include tags
                for tag in ("filename", "spool_id", "material"):
                    if tag not in row:
                        row[tag] = record.values.get(tag)
                results.append(row)
        return results

    def count_history(self) -> int:
        flux = f"""
from(bucket: "{self._bucket}")
  |> range(start: -365d)
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

    def close(self) -> None:
        self._client.close()


influx = InfluxClient()
