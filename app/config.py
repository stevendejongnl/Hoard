from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    moonraker_url: str = "http://localhost:7125"
    moonraker_ws: str = "ws://localhost:7125/websocket"
    ha_url: str = "http://localhost:8123"
    ha_token: str = ""
    influxdb_url: str = "http://localhost:8086"
    influxdb_token: str = ""
    influxdb_org: str = "my-org"
    influxdb_bucket: str = "home"
    database_path: str = "/data/hoard.db"
    static_dir: str = "static"
    uploads_dir: str = "./uploads"
    redis_url: str = "redis://localhost:6379"
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
