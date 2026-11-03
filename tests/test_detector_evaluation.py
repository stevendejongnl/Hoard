from typing import Any

import pytest

from app.detector_evaluation import (
    InvalidManifestError,
    LabelledImage,
    ScoredImage,
    evaluate,
    format_report,
    parse_manifest,
    rates_at,
    summarise_tiers,
)
from app.detectors import Detection, DetectorUnavailableError


def scored(tier: str, score: float | None, name: str = "a.jpg") -> ScoredImage:
    return ScoredImage(LabelledImage(name, tier), score)


class FakeDetector:
    def __init__(self, scores: dict[str, float | None]) -> None:
        self.scores = scores
        self.asked: list[str] = []

    async def detect(self, snapshot_url: str) -> list[Detection]:
        self.asked.append(snapshot_url)
        score = self.scores[snapshot_url.rsplit("/", 1)[1]]
        if score is None:
            raise DetectorUnavailableError("down")
        return [Detection("failure", score, None)]


def test_a_manifest_lists_each_image_with_its_tier():
    data: dict[str, Any] = {
        "images": [{"file": "a.jpg", "tier": "obvious", "source": "https://example.test/a", "licence": "CC0"}]
    }
    assert parse_manifest(data) == [LabelledImage("a.jpg", "obvious")]


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"images": [{"tier": "obvious"}]},
        {"images": [{"file": "a.jpg"}]},
        {"images": [{"file": "a.jpg", "tier": "very-hard"}]},
    ],
)
def test_a_manifest_that_makes_no_sense_is_refused(data: dict[str, Any]):
    with pytest.raises(InvalidManifestError):
        parse_manifest(data)


def test_the_tier_says_whether_the_image_shows_a_failure():
    failing = [LabelledImage("a.jpg", tier).shows_failure for tier in ("obvious", "partial", "early")]
    fine = [LabelledImage("a.jpg", tier).shows_failure for tier in ("good", "hard-negative")]
    assert failing == [True, True, True]
    assert fine == [False, False]


async def test_every_image_is_judged_from_its_address_under_the_base():
    detector = FakeDetector({"a.jpg": 0.9, "b.jpg": 0.1})
    images = [LabelledImage("a.jpg", "obvious"), LabelledImage("b.jpg", "good")]
    results = await evaluate(detector, images, "http://images:8099/")
    assert detector.asked == ["http://images:8099/a.jpg", "http://images:8099/b.jpg"]
    assert [result.score for result in results] == [0.9, 0.1]


async def test_an_image_without_detections_scores_zero():
    class Empty:
        async def detect(self, snapshot_url: str) -> list[Detection]:
            return []

    [result] = await evaluate(Empty(), [LabelledImage("a.jpg", "good")], "http://images/")
    assert result.score == 0.0


async def test_an_image_the_detector_cannot_judge_has_no_score_and_the_rest_go_on():
    detector = FakeDetector({"a.jpg": None, "b.jpg": 0.4})
    images = [LabelledImage("a.jpg", "obvious"), LabelledImage("b.jpg", "good")]
    results = await evaluate(detector, images, "http://images/")
    assert [result.score for result in results] == [None, 0.4]


def test_the_rates_are_the_share_of_failures_caught_and_of_good_prints_flagged():
    results = [
        scored("obvious", 0.9),
        scored("early", 0.4),
        scored("good", 0.6),
        scored("hard-negative", 0.1),
        scored("good", 0.2),
    ]
    rates = rates_at(results, 0.5)
    assert rates.detection_rate == 0.5
    assert rates.false_alarm_rate == pytest.approx(1 / 3)


def test_a_score_equal_to_the_threshold_counts_as_failing():
    rates = rates_at([scored("obvious", 0.5), scored("good", 0.5)], 0.5)
    assert (rates.detection_rate, rates.false_alarm_rate) == (1.0, 1.0)


def test_a_class_without_images_has_no_rate():
    rates = rates_at([scored("obvious", 0.9)], 0.5)
    assert (rates.detection_rate, rates.false_alarm_rate) == (1.0, None)


def test_images_that_could_not_be_judged_are_left_out_of_the_rates():
    rates = rates_at([scored("obvious", None), scored("obvious", 0.9)], 0.5)
    assert rates.detection_rate == 1.0


def test_each_tier_is_summarised_with_its_lowest_mean_and_highest_score():
    results = [scored("obvious", 0.9), scored("obvious", 0.7), scored("good", 0.1), scored("good", None)]
    summary = summarise_tiers(results)
    assert (summary["obvious"].count, summary["obvious"].lowest, summary["obvious"].highest) == (2, 0.7, 0.9)
    assert summary["obvious"].mean == pytest.approx(0.8)
    assert summary["good"].count == 1
    assert summary["good"].unjudged == 1


def test_the_report_names_the_tiers_and_the_rates_at_each_threshold():
    results = [scored("obvious", 0.9), scored("good", 0.1), scored("hard-negative", None)]
    report = format_report(results, [0.5])
    assert "obvious" in report and "hard-negative" in report
    assert "50%" in report
    assert "100%" in report
    assert "1 image could not be judged" in report


def test_a_report_without_unjudged_images_does_not_mention_them():
    assert "could not be judged" not in format_report([scored("obvious", 0.9)], [0.5])
