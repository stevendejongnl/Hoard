import asyncio
from collections.abc import AsyncIterator

import pytest

from app.mjpeg_relay import read_frames, relay_latest_frames

BOUNDARY_LINE = b"--boundarydonotcross\r\n"
TRICKY_FRAME = b"\xff\xd8abc\r\n\r\n--boundarydonotcross\r\ndef\xff\xd9"


def make_part(body: bytes, *, with_length: bool = True) -> bytes:
    headers = b"Content-Type: image/jpeg\r\n"
    if with_length:
        headers += b"Content-Length: %d\r\n" % len(body)
    return BOUNDARY_LINE + headers + b"X-Timestamp: 1.5\r\n\r\n" + body + b"\r\n"


async def chunked(data: bytes, size: int) -> AsyncIterator[bytes]:
    for start in range(0, len(data), size):
        yield data[start : start + size]


async def collect(frames: AsyncIterator[bytes]) -> list[bytes]:
    return [frame async for frame in frames]


def read_body(part: bytes) -> bytes:
    return part.split(b"\r\n\r\n", 1)[1].removesuffix(b"\r\n")


class FakeCamera:
    """A camera stream the test feeds by hand, to decide when the bytes arrive."""

    def __init__(self) -> None:
        self.queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self.was_closed = False

    async def chunks(self) -> AsyncIterator[bytes]:
        try:
            while (chunk := await self.queue.get()) is not None:
                yield chunk
        finally:
            self.was_closed = True

    def send_frame(self, body: bytes) -> None:
        self.queue.put_nowait(make_part(body))

    def end(self) -> None:
        self.queue.put_nowait(None)


async def test_frames_are_read_from_a_stream_in_one_chunk():
    data = make_part(b"first") + make_part(b"second")
    assert await collect(read_frames(chunked(data, len(data)))) == [b"first", b"second"]


async def test_frames_are_read_from_chunks_of_one_byte_and_the_length_decides_where_a_frame_ends():
    data = make_part(TRICKY_FRAME) + make_part(b"second")
    assert await collect(read_frames(chunked(data, 1))) == [TRICKY_FRAME, b"second"]


async def test_a_frame_that_is_cut_off_is_not_returned():
    data = make_part(b"whole") + make_part(b"cut off")[:-10]
    assert await collect(read_frames(chunked(data, 7))) == [b"whole"]


async def test_a_frame_without_a_length_is_refused():
    with pytest.raises(ValueError, match="Content-Length"):
        await collect(read_frames(chunked(make_part(b"frame", with_length=False), 64)))


async def test_a_relayed_frame_is_a_complete_part_with_its_own_boundary_and_length():
    camera = FakeCamera()
    camera.send_frame(b"frame")
    relay = relay_latest_frames(camera.chunks())
    part = await anext(relay)
    await relay.aclose()
    assert part == b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 5\r\n\r\nframe\r\n"


async def test_a_slow_client_gets_the_newest_frame_and_the_frames_in_between_are_dropped():
    camera = FakeCamera()
    relay = relay_latest_frames(camera.chunks())
    camera.send_frame(b"A")
    first = await anext(relay)
    camera.send_frame(b"B")
    camera.send_frame(b"C")
    await asyncio.sleep(0.01)
    camera.end()
    rest = [part async for part in relay]
    assert read_body(first) == b"A"
    assert [read_body(part) for part in rest] == [b"C"]


async def test_the_last_frame_is_still_sent_when_the_camera_stream_ends():
    camera = FakeCamera()
    camera.send_frame(b"A")
    camera.end()
    parts = [part async for part in relay_latest_frames(camera.chunks())]
    assert [read_body(part) for part in parts] == [b"A"]


async def test_the_camera_stream_is_closed_when_the_client_goes_away():
    camera = FakeCamera()
    relay = relay_latest_frames(camera.chunks())
    camera.send_frame(b"A")
    await anext(relay)
    await relay.aclose()
    assert camera.was_closed
