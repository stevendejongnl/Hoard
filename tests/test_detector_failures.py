import httpx
import pytest

from app.detectors import DetectorUnavailableError
from app.obico_detector import ObicoDetector
from tests.test_obico_detector import FakeHttpClient

SNAPSHOT_URL = "http://camera/snapshot"


async def failure_of(failure: Exception) -> str:
    detector = ObicoDetector("http://detector:3333", http_client_factory=lambda: FakeHttpClient(failure=failure))
    with pytest.raises(DetectorUnavailableError) as raised:
        await detector.detect(SNAPSHOT_URL)
    return str(raised.value)


async def test_the_message_names_the_kind_of_failure_even_when_it_has_no_text():
    assert (await failure_of(httpx.ReadTimeout(""))).startswith("ReadTimeout")


async def test_the_message_keeps_the_text_of_the_failure():
    assert "refused by peer" in await failure_of(ConnectionError("refused by peer"))


async def test_a_timeout_says_the_detector_did_not_answer_in_time():
    assert "in time" in await failure_of(httpx.ReadTimeout(""))


async def test_a_connection_failure_says_to_check_the_address_and_that_it_runs():
    message = await failure_of(httpx.ConnectError("no route"))
    assert "address" in message
    assert "running" in message
