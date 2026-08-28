from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    moonraker_url: str = "http://192.168.1.102"
    moonraker_ws: str = "ws://192.168.1.102/websocket"
    ha_url: str = "http://192.168.1.25:8123"
    ha_token: str = ""
    influxdb_url: str = "http://192.168.1.22:8086"
    influxdb_token: str = ""
    influxdb_org: str = "my-org"
    influxdb_bucket: str = "home"
    database_path: str = "/data/printer.db"
    static_dir: str = "static"
    uploads_dir: str = "./uploads"
    redis_url: str = "redis://localhost:6379"
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:steven@steven-dejong.nl"

    model_config = {"env_file": ".env"}


settings = Settings()
