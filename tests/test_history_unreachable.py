from httpx import AsyncClient

from app.config import settings

CLOSED_ADDRESS = "http://127.0.0.1:1"


async def test_the_history_says_the_printer_cannot_be_reached_and_not_that_there_are_no_prints(
    client: AsyncClient, monkeypatch
):
    monkeypatch.setattr(settings, "moonraker_url", CLOSED_ADDRESS)
    response = await client.get("/api/history")
    assert response.status_code == 502
    assert "printer cannot be reached" in response.json()["detail"]
