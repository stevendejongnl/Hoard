import base64
import json
from typing import Any

import pytest

from app.detectors import Detection, DetectorUnavailableError
from app.vision_detector import VisionDetector

SNAPSHOT_URL = "http://hoard/api/webcams/0/snapshot"
FRAME = b"jpeg-bytes"


class FakeResponse:
    def __init__(self, body: Any = None, content: bytes = b"", status_code: int = 200) -> None:
        self.body = body
        self.content = content
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"status {self.status_code}")

    def json(self) -> Any:
        return self.body


def answer(text: str) -> FakeResponse:
    return FakeResponse({"content": [{"type": "text", "text": text}]})


class FakeHttpClient:
    def __init__(self, reply: FakeResponse | None = None, frame_failure: Exception | None = None) -> None:
        self.reply = reply or answer('{"failure_probability": 0.9}')
        self.frame_failure = frame_failure
        self.posted: list[tuple[str, dict[str, Any]]] = []
        self.fetched: list[str] = []

    async def __aenter__(self) -> "FakeHttpClient":
        return self

    async def __aexit__(self, *exception_details: Any) -> None:
        return None

    async def get(self, url: str, **keywords: Any) -> FakeResponse:
        self.fetched.append(url)
        if self.frame_failure:
            raise self.frame_failure
        return FakeResponse(content=FRAME)

    async def post(self, url: str, **keywords: Any) -> FakeResponse:
        self.posted.append((url, keywords))
        return self.reply


def make_detector(client: FakeHttpClient) -> VisionDetector:
    return VisionDetector(
        "secret-key", "claude-haiku-5-5", "https://api.example.test", http_client_factory=lambda: client
    )


async def test_it_fetches_the_camera_image_and_sends_it_to_the_model_with_the_key_in_a_header():
    client = FakeHttpClient()
    await make_detector(client).detect(SNAPSHOT_URL)
    assert client.fetched == [SNAPSHOT_URL]
    url, keywords = client.posted[0]
    assert url == "https://api.example.test/v1/messages"
    assert keywords["headers"]["x-api-key"] == "secret-key"
    assert "secret-key" not in url
    body = keywords["json"]
    assert body["model"] == "claude-haiku-5-5"
    image = body["messages"][0]["content"][0]
    assert image["source"] == {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": base64.b64encode(FRAME).decode(),
    }


async def test_the_failure_probability_of_the_model_is_the_score():
    detections = await make_detector(FakeHttpClient()).detect(SNAPSHOT_URL)
    assert detections == [Detection("failure", 0.9, None)]


async def test_an_answer_wrapped_in_text_or_a_code_fence_is_still_read():
    reply = answer('Here is my answer:\n```json\n{"failure_probability": 0.25, "reason": "clean"}\n```')
    [detection] = await make_detector(FakeHttpClient(reply)).detect(SNAPSHOT_URL)
    assert detection.score == 0.25


@pytest.mark.parametrize(("given", "expected"), [(1.7, 1.0), (-0.3, 0.0)])
async def test_a_probability_outside_zero_and_one_is_cut_to_the_range(given: float, expected: float):
    reply = answer(json.dumps({"failure_probability": given}))
    [detection] = await make_detector(FakeHttpClient(reply)).detect(SNAPSHOT_URL)
    assert detection.score == expected


@pytest.mark.parametrize(
    "reply",
    [
        answer("I cannot tell"),
        answer('{"failure_probability": "high"}'),
        answer("{}"),
        FakeResponse({"content": []}),
        FakeResponse(status_code=529),
    ],
)
async def test_an_answer_that_cannot_be_used_means_the_detector_is_unavailable(reply: FakeResponse):
    with pytest.raises(DetectorUnavailableError):
        await make_detector(FakeHttpClient(reply)).detect(SNAPSHOT_URL)


async def test_a_camera_that_does_not_answer_means_the_detector_is_unavailable():
    client = FakeHttpClient(frame_failure=ConnectionError("refused"))
    with pytest.raises(DetectorUnavailableError):
        await make_detector(client).detect(SNAPSHOT_URL)
    assert client.posted == []
