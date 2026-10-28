from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    moonraker_url: str = "http://localhost:7125"
    moonraker_ws: str = "ws://localhost:7125/websocket"
    ha_url: str = "http://localhost:8123"
    ha_token: str = Field(default="", repr=False)
    # The Home Assistant entities that Hoard reads and switches. Map them to the names of your own setup.
    ha_power_sensor: str = "sensor.3d_printer_power"
    ha_price_sensor: str = "sensor.electricity_price_all_in"
    ha_power_switch: str = "switch.3d_printer"
    # More switches to control from the dashboard, as comma separated Label=entity pairs, for example
    # "Power strip=switch.feed_plug,Raspberry Pi=switch.pi_outlet". Any switch, light or input_boolean works.
    ha_switches: str = ""
    # Energy sensors (kWh, total increasing), oldest first, separated by commas: a plug that was replaced or
    # renamed keeps its old sensor here, so older prints can still be worked out.
    ha_energy_sensors: str = "sensor.3d_printer_energy"
    influxdb_url: str = "http://localhost:8086"
    influxdb_token: str = Field(default="", repr=False)
    influxdb_org: str = "my-org"
    influxdb_bucket: str = "home"
    database_path: str = "/data/hoard.db"
    static_dir: str = "static"
    # Empty means a folder next to the database: that folder is on the persistent volume of a deployment.
    uploads_dir: str = ""
    redis_url: str = "redis://localhost:6379"
    vapid_public_key: str = ""
    vapid_private_key: str = Field(default="", repr=False)
    vapid_subject: str = "mailto:admin@example.com"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @model_validator(mode="after")
    def place_uploads_next_to_the_database(self) -> "Settings":
        if not self.uploads_dir:
            self.uploads_dir = str(Path(self.database_path).parent / "uploads")
        return self


settings = Settings()
