"""A vision model as print failure detector: it looks at the camera image and says how likely the print failed.

The camera image leaves the network for this detector. The key is sent in a header, never in an address.
"""

import base64
import json
import re
from collections.abc import Callable
from typing import Any

import httpx

from app.detectors import Detection, DetectorUnavailableError

REQUEST_TIMEOUT = 30.0
API_VERSION = "2023-06-01"
# The current models think by default and thinking counts against max_tokens, so the limit leaves room for it.
MAXIMUM_ANSWER_TOKENS = 4096
FIRST_JSON_OBJECT = re.compile(r"\{.*?\}", re.DOTALL)

PROMPT = (
    "This is a camera image of a 3D printer while it prints. Judge whether the print has failed: loose strings "
    "of filament (spaghetti), a print that came off the bed, or a print that is not where it should be. A print "
    "that goes well, stringing, supports and an empty bed are not a failure. Answer with JSON only: "
    '{"failure_probability": a number from 0 to 1, "reason": "a short reason"}'
)


def _read_probability(answer: dict[str, Any]) -> float:
    text = next(block["text"] for block in answer["content"] if block["type"] == "text")
    probability = json.loads(FIRST_JSON_OBJECT.search(text).group())["failure_probability"]  # type: ignore[union-attr]
    if isinstance(probability, bool) or not isinstance(probability, int | float):
        raise ValueError("The failure probability is not a number")
    return min(1.0, max(0.0, float(probability)))


class VisionDetector:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str,
        http_client_factory: Callable[[], Any] = lambda: httpx.AsyncClient(timeout=REQUEST_TIMEOUT),
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._http_client_factory = http_client_factory

    async def detect(self, snapshot_url: str) -> list[Detection]:
        try:
            frame = await self._fetch_frame(snapshot_url)
            answer = await self._ask(frame)
            return [Detection("failure", _read_probability(answer), None)]
        except Exception as exc:
            raise DetectorUnavailableError(str(exc)) from exc

    async def _fetch_frame(self, snapshot_url: str) -> bytes:
        async with self._http_client_factory() as client:
            response = await client.get(snapshot_url)
            response.raise_for_status()
            return response.content

    async def _ask(self, frame: bytes) -> dict[str, Any]:
        image = {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(frame).decode()},
        }
        body = {
            "model": self._model,
            "max_tokens": MAXIMUM_ANSWER_TOKENS,
            "output_config": {"effort": "low"},
            "messages": [{"role": "user", "content": [image, {"type": "text", "text": PROMPT}]}],
        }
        headers = {"x-api-key": self._api_key, "anthropic-version": API_VERSION, "content-type": "application/json"}
        async with self._http_client_factory() as client:
            response = await client.post(f"{self._base_url}/v1/messages", headers=headers, json=body)
            response.raise_for_status()
            return response.json()
