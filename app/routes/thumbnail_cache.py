import time
from dataclasses import dataclass

_TIME_TO_LIVE_SECONDS = 3600


@dataclass(frozen=True)
class CachedThumbnail:
    """What was found for a file; `image` is None when the file is known to have no thumbnail."""

    image: bytes | None


class ThumbnailCache:
    """In-memory thumbnail cache. A file without a thumbnail is cached too, to avoid repeated failed lookups."""

    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._entries: dict[str, tuple[float, bytes | None]] = {}

    def find(self, filename: str) -> CachedThumbnail | None:
        entry = self._entries.get(filename)
        if entry is None or entry[0] <= self._clock():
            return None
        return CachedThumbnail(entry[1])

    def store(self, filename: str, image: bytes | None) -> None:
        self._entries[filename] = (self._clock() + _TIME_TO_LIVE_SECONDS, image)

    def forget(self, filename: str) -> None:
        self._entries.pop(filename, None)

    def forget_all(self) -> None:
        self._entries.clear()


thumbnail_cache = ThumbnailCache()
