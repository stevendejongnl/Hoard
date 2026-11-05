import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import db
from app.config import settings
from app.main import app
from app.routes.dependencies import provide_printer_power
from tests.route_fakes import FakePrinterPower, override_provider


@pytest.fixture
def printer_power(monkeypatch):
    """The printer's power, as a fake: no test shuts down or restarts a real printer."""
    fake = FakePrinterPower()
    override_provider(monkeypatch, provide_printer_power, fake)
    return fake


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch, printer_power):
    db_path = str(tmp_path / "test.db")
    await db.init_db(db_path)
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path / "uploads"))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
