"""Relays a camera's MJPEG stream as whole frames, newest first.

A browser draws a frame while it arrives. Over a slow link that shows half a picture. The relay cuts the
stream into frames by their Content-Length and keeps only the newest complete one for a client that is
still busy, so a slow client gets fewer frames instead of half frames.
"""

import asyncio
import re
from collections.abc import AsyncGenerator, AsyncIterator

HEADER_END = b"\r\n\r\n"
CONTENT_LENGTH = re.compile(rb"^Content-Length:\s*(\d+)\s*$", re.IGNORECASE | re.MULTILINE)
RELAY_BOUNDARY = "frame"
RELAY_CONTENT_TYPE = f"multipart/x-mixed-replace; boundary={RELAY_BOUNDARY}"


def find_frame_length(headers: bytes) -> int:
    match = CONTENT_LENGTH.search(headers)
    if match is None:
        raise ValueError("The camera sent a frame without Content-Length")
    return int(match.group(1))


def format_part(frame: bytes) -> bytes:
    headers = b"--%b\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % (RELAY_BOUNDARY.encode(), len(frame))
    return headers + frame + b"\r\n"


class FrameBuffer:
    """The bytes received so far, from which whole frames are taken."""

    def __init__(self) -> None:
        self._data = b""

    def add(self, chunk: bytes) -> None:
        self._data += chunk

    def take_frames(self) -> list[bytes]:
        frames = []
        while (frame := self._take_frame()) is not None:
            frames.append(frame)
        return frames

    def _take_frame(self) -> bytes | None:
        header_end = self._data.find(HEADER_END)
        if header_end < 0:
            return None
        body_start = header_end + len(HEADER_END)
        body_end = body_start + find_frame_length(self._data[:header_end])
        if len(self._data) < body_end:
            return None
        frame = self._data[body_start:body_end]
        self._data = self._data[body_end:]
        return frame


class LatestFrame:
    """Holds the newest frame that was not taken yet; an older one that was not taken is replaced."""

    def __init__(self) -> None:
        self._frame: bytes | None = None
        self._is_finished = False
        self._changed = asyncio.Event()

    def publish(self, frame: bytes) -> None:
        self._frame = frame
        self._changed.set()

    def finish(self) -> None:
        self._is_finished = True
        self._changed.set()

    async def take(self) -> bytes | None:
        """The newest frame, or None when the stream has ended and nothing is left."""
        while self._frame is None and not self._is_finished:
            self._changed.clear()
            await self._changed.wait()
        frame, self._frame = self._frame, None
        return frame


async def read_frames(chunks: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    buffer = FrameBuffer()
    async for chunk in chunks:
        buffer.add(chunk)
        for frame in buffer.take_frames():
            yield frame


async def publish_frames(chunks: AsyncIterator[bytes], latest: LatestFrame) -> None:
    try:
        async for frame in read_frames(chunks):
            latest.publish(frame)
    finally:
        latest.finish()


async def relay_latest_frames(chunks: AsyncIterator[bytes]) -> AsyncGenerator[bytes, None]:
    latest = LatestFrame()
    publisher = asyncio.create_task(publish_frames(chunks, latest))
    try:
        while (frame := await latest.take()) is not None:
            yield format_part(frame)
        await publisher
    finally:
        publisher.cancel()
        await asyncio.gather(publisher, return_exceptions=True)
