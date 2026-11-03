"""The detector of Obico's ml_api: a separate container that fetches the camera image itself and answers with boxes."""

from collections.abc import Callable
from typing import Any

import httpx

from app.detectors import Detection, DetectorUnavailableError

REQUEST_TIMEOUT = 10.0


def _read_detection(entry: list[Any]) -> Detection:
    label, score, box = entry
    return Detection(label=label, score=float(score), box=tuple(box) if box else None)


class ObicoDetector:
    def __init__(
        self,
        base_url: str,
        token: str = "",
        http_client_factory: Callable[[], Any] = lambda: httpx.AsyncClient(timeout=REQUEST_TIMEOUT),
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._http_client_factory = http_client_factory

    async def detect(self, snapshot_url: str) -> list[Detection]:
        try:
            body = await self._ask(snapshot_url)
            return [_read_detection(entry) for entry in body["detections"]]
        except Exception as exc:
            raise DetectorUnavailableError(str(exc)) from exc

    async def _ask(self, snapshot_url: str) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._token}"} if self._token else {}
        async with self._http_client_factory() as client:
            response = await client.get(f"{self._base_url}/p/", params={"img": snapshot_url}, headers=headers)
            response.raise_for_status()
            return response.json()
