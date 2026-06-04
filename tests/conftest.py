import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app import db
from app.config import settings
from app.main import app


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    await db.init_db(db_path)
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path / "uploads"))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
