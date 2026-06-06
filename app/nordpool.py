"""Nord Pool NL electricity price fetcher and InfluxDB backfill.

Fetches historical hourly day-ahead prices for the NL bidding zone and
stores them as an `electricity_price` measurement in InfluxDB so we can
look up the actual price at any historical print time.

The all-in formula mirrors the HA integration entity sensor.nordpool_kwh_nl_eur_3_10_021:
    all_in = (spot_eur_per_kwh + ADDITIONAL_COSTS) * (1 + VAT)

The entity name encodes the config that has been constant since setup:
    3   = 3 decimal display precision (irrelevant for calculation)
    10  = additional_costs = 0.10 €/kWh  (energy tax + grid costs per contract)
    021 = vat = 21%

Using these same constants ensures backfilled prices match what the sensor
would have shown at any historical point in time.
"""

import logging
import re
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from app.influx import influx

log = logging.getLogger(__name__)

# Nord Pool public API — returns Elspot day-ahead prices for all European areas
_NP_URL = "https://www.nordpoolgroup.com/api/marketdata/page/10"

# Constants from the HA entity name: sensor.nordpool_kwh_nl_eur_3_10_021
# These have been constant since initial setup — do not vary by year.
_ADDITIONAL_COSTS = 0.10  # €/kWh — from "10" in entity slug
_VAT = 0.21  # 21% — from "021" in entity slug


def spot_to_all_in(spot_eur_per_mwh: float, year: int = 0) -> float:
    """Convert Nord Pool spot price (€/MWh) to all-in retail price (€/kWh)."""
    spot_kwh = spot_eur_per_mwh / 1000
    return round((spot_kwh + _ADDITIONAL_COSTS) * (1 + _VAT), 6)


def _parse_ms_date(raw: str) -> datetime | None:
    """Parse /Date(ms)/ or ISO string to UTC datetime."""
    m = re.search(r"/Date\((\d+)\)/", raw)
    if m:
        return datetime.fromtimestamp(int(m.group(1)) / 1000, tz=UTC)
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


async def fetch_day_prices(d: date) -> dict[datetime, float]:
    """Fetch hourly NL spot prices (€/MWh) for a given date from Nord Pool."""
    date_str = d.strftime("%d-%m-%Y")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                _NP_URL,
                params={"currency": "EUR", "enddate": date_str},
                headers={"Accept": "application/json"},
            )
            r.raise_for_status()
            data: dict[str, Any] = r.json()
    except Exception as exc:
        log.warning("Nord Pool fetch failed for %s: %s", d, exc)
        return {}

    rows = data.get("data", {}).get("Rows", [])
    prices: dict[datetime, float] = {}

    for row in rows:
        start_raw = row.get("StartTime", "")
        dt = _parse_ms_date(start_raw)
        if dt is None:
            continue

        nl_col = next(
            (c for c in row.get("Columns", []) if c.get("Name") == "NL"),
            None,
        )
        if nl_col is None:
            continue

        val_str = nl_col.get("Value", "").replace(",", ".").replace(" ", "")
        try:
            prices[dt] = float(val_str)
        except ValueError:
            continue

    return prices


async def backfill_prices(start_date: date, end_date: date) -> int:
    """Fetch Nord Pool NL prices for a date range and write to InfluxDB.

    Returns the number of hourly points written.
    """
    written = 0
    current = start_date
    while current <= end_date:
        day_prices = await fetch_day_prices(current)
        for dt, spot_mwh in day_prices.items():
            all_in = spot_to_all_in(spot_mwh, dt.year)
            influx.write_electricity_price(dt, all_in)
            written += 1
        if day_prices:
            log.info("nordpool: wrote %d hourly prices for %s", len(day_prices), current)
        current += timedelta(days=1)
    return written


async def record_current_price(price: float) -> None:
    """Write the current HA electricity price to InfluxDB."""
    influx.write_electricity_price(datetime.now(UTC), price)
