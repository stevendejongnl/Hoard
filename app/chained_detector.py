"""Two detectors in a row: the cheap one judges every frame, the strong one only the frames it is unsure about."""

from app.detectors import Detection, Detector, DetectorUnavailableError, highest_score


class ChainedDetector:
    def __init__(self, first: Detector, second: Detector, low: float, high: float) -> None:
        self._first = first
        self._second = second
        self._low = low
        self._high = high

    async def detect(self, snapshot_url: str) -> list[Detection]:
        try:
            detections = await self._first.detect(snapshot_url)
        except DetectorUnavailableError:
            return await self._second.detect(snapshot_url)
        if not self._low <= highest_score(detections) <= self._high:
            return detections
        return await self._judge_borderline(snapshot_url, detections)

    async def _judge_borderline(self, snapshot_url: str, first_answer: list[Detection]) -> list[Detection]:
        try:
            return await self._second.detect(snapshot_url)
        except DetectorUnavailableError:
            return first_answer
