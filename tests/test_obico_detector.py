from typing import Any

import pytest

from app.detectors import Detection, DetectorUnavailableError, highest_score
from app.obico_detector import REQUEST_TIMEOUT, ObicoDetector

SNAPSHOT_URL = "http://camera/snapshot"


class FakeResponse:
    def __init__(self, body: Any = None, status_code: int = 200) -> None:
        self.body = body if body is not None else {"detections": []}
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"status {self.status_code}")

    def json(self) -> Any:
        return self.body


class FakeHttpClient:
    def __init__(self, response: FakeResponse | None = None, failure: Exception | None = None) -> None:
        self.response = response or FakeResponse()
        self.failure = failure
        self.requests: list[tuple[str, dict[str, Any]]] = []

    async def __aenter__(self) -> "FakeHttpClient":
        return self

    async def __aexit__(self, *exception_details: Any) -> None:
        return None

    async def get(self, url: str, **keywords: Any) -> FakeResponse:
        self.requests.append((url, keywords))
        if self.failure:
            raise self.failure
        return self.response


def make_detector(client: FakeHttpClient, token: str = "") -> ObicoDetector:
    return ObicoDetector("http://detector:3333", token=token, http_client_factory=lambda: client)


async def test_it_asks_the_detector_to_fetch_the_snapshot():
    client = FakeHttpClient()
    await make_detector(client).detect(SNAPSHOT_URL)
    url, keywords = client.requests[0]
    assert url == "http://detector:3333/p/"
    assert keywords["params"] == {"img": SNAPSHOT_URL}


async def test_it_reads_label_score_and_box_of_every_detection():
    body = {"detections": [["failure", 0.62, [10.0, 20.0, 30.0, 40.0]]]}
    detections = await make_detector(FakeHttpClient(FakeResponse(body))).detect(SNAPSHOT_URL)
    assert detections == [Detection(label="failure", score=0.62, box=(10.0, 20.0, 30.0, 40.0))]


async def test_a_frame_without_detections_gives_an_empty_list():
    assert await make_detector(FakeHttpClient()).detect(SNAPSHOT_URL) == []


async def test_a_token_is_sent_as_a_bearer_header():
    client = FakeHttpClient()
    await make_detector(client, token="secret").detect(SNAPSHOT_URL)
    assert client.requests[0][1]["headers"] == {"Authorization": "Bearer secret"}


async def test_without_a_token_no_authorization_header_is_sent():
    client = FakeHttpClient()
    await make_detector(client).detect(SNAPSHOT_URL)
    assert client.requests[0][1]["headers"] == {}


async def test_an_error_status_means_the_detector_is_unavailable():
    client = FakeHttpClient(FakeResponse(status_code=400))
    with pytest.raises(DetectorUnavailableError):
        await make_detector(client).detect(SNAPSHOT_URL)


async def test_a_detector_that_does_not_answer_is_unavailable():
    client = FakeHttpClient(failure=ConnectionError("refused"))
    with pytest.raises(DetectorUnavailableError):
        await make_detector(client).detect(SNAPSHOT_URL)


def test_the_highest_score_is_the_one_of_the_most_certain_detection():
    detections = [Detection("failure", 0.2, None), Detection("failure", 0.7, None)]
    assert highest_score(detections) == 0.7


def test_no_detections_score_zero():
    assert highest_score([]) == 0.0


def test_the_detector_gets_time_to_judge_a_frame_on_a_slow_cpu():
    # Measured with the real container: about 5.5 seconds a frame on a desktop CPU, so a slower node needs more.
    assert REQUEST_TIMEOUT >= 30
