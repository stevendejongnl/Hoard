from app.chained_detector import ChainedDetector
from app.detectors import Detection, DetectorUnavailableError


class FakeDetector:
    def __init__(self, score: float | None) -> None:
        self.score = score
        self.asked = 0

    async def detect(self, snapshot_url: str) -> list[Detection]:
        self.asked += 1
        if self.score is None:
            raise DetectorUnavailableError("down")
        return [Detection("failure", self.score, None)]


def make_chain(local: float | None, judge: float | None) -> tuple[ChainedDetector, FakeDetector, FakeDetector]:
    first, second = FakeDetector(local), FakeDetector(judge)
    return ChainedDetector(first, second, low=0.3, high=0.7), first, second


async def test_a_clear_score_of_the_first_detector_is_kept_and_the_second_is_not_asked():
    for score in (0.1, 0.9):
        chain, _, second = make_chain(score, 0.5)
        [detection] = await chain.detect("http://camera/frame")
        assert detection.score == score
        assert second.asked == 0


async def test_a_score_in_the_borderline_band_is_judged_by_the_second_detector():
    chain, _, second = make_chain(0.5, 0.95)
    [detection] = await chain.detect("http://camera/frame")
    assert detection.score == 0.95
    assert second.asked == 1


async def test_the_edges_of_the_band_count_as_borderline():
    for score in (0.3, 0.7):
        chain, _, second = make_chain(score, 0.2)
        await chain.detect("http://camera/frame")
        assert second.asked == 1


async def test_a_second_detector_that_is_down_leaves_the_score_of_the_first():
    chain, _, _ = make_chain(0.5, None)
    [detection] = await chain.detect("http://camera/frame")
    assert detection.score == 0.5


async def test_a_first_detector_that_is_down_hands_the_frame_to_the_second():
    chain, _, _ = make_chain(None, 0.8)
    [detection] = await chain.detect("http://camera/frame")
    assert detection.score == 0.8


async def test_both_detectors_down_means_unavailable():
    chain, _, _ = make_chain(None, None)
    try:
        await chain.detect("http://camera/frame")
    except DetectorUnavailableError:
        return
    raise AssertionError("expected DetectorUnavailableError")
