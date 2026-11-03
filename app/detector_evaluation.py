"""Scores a labelled set of camera images with a detector and shows how well it tells failures from good prints.

Run it against a detector that is up, with a folder of images and a manifest that gives each image a tier:

    python -m app.detector_evaluation images/manifest.json --detector-url http://localhost:3333

The tiers go from easy to hard. The failures are obvious, partial and early. The good prints are good, and
hard-negative: a good print that looks wrong, such as stringing, supports, a dark filament or a reflection.
"""

import argparse
import asyncio
import functools
import http.server
import json
import os
import threading
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.detectors import Detector, DetectorUnavailableError, highest_score
from app.obico_detector import ObicoDetector

FAILURE_TIERS = ("obvious", "partial", "early")
GOOD_TIERS = ("good", "hard-negative")
TIERS = (*FAILURE_TIERS, *GOOD_TIERS)
DEFAULT_THRESHOLDS = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
DEFAULT_PORT = 8099
PERCENT = 100


class InvalidManifestError(ValueError):
    """The manifest lacks an image list, or an image has no file or a tier that does not exist."""


@dataclass(frozen=True)
class LabelledImage:
    file: str
    tier: str

    @property
    def shows_failure(self) -> bool:
        return self.tier in FAILURE_TIERS


@dataclass(frozen=True)
class ScoredImage:
    image: LabelledImage
    score: float | None


@dataclass(frozen=True)
class ThresholdRates:
    threshold: float
    detection_rate: float | None
    false_alarm_rate: float | None


@dataclass(frozen=True)
class TierSummary:
    count: int
    unjudged: int
    lowest: float | None
    highest: float | None
    mean: float | None


def _read_image(entry: Any) -> LabelledImage:
    if not isinstance(entry, dict) or "file" not in entry:
        raise InvalidManifestError("Every image needs a file")
    if entry.get("tier") not in TIERS:
        raise InvalidManifestError(f"{entry['file']}: the tier is one of {', '.join(TIERS)}")
    return LabelledImage(entry["file"], entry["tier"])


def parse_manifest(data: dict[str, Any]) -> list[LabelledImage]:
    if "images" not in data:
        raise InvalidManifestError("The manifest needs a list of images")
    return [_read_image(entry) for entry in data["images"]]


async def evaluate(detector: Detector, images: Sequence[LabelledImage], base_url: str) -> list[ScoredImage]:
    results = []
    for image in images:
        try:
            score: float | None = highest_score(await detector.detect(f"{base_url.rstrip('/')}/{image.file}"))
        except DetectorUnavailableError:
            score = None
        results.append(ScoredImage(image, score))
    return results


def _judged(results: Sequence[ScoredImage], shows_failure: bool) -> list[float]:
    return [
        result.score for result in results if result.score is not None and result.image.shows_failure == shows_failure
    ]


def _share_at_or_above(scores: list[float], threshold: float) -> float | None:
    if not scores:
        return None
    return len([score for score in scores if score >= threshold]) / len(scores)


def rates_at(results: Sequence[ScoredImage], threshold: float) -> ThresholdRates:
    return ThresholdRates(
        threshold,
        _share_at_or_above(_judged(results, True), threshold),
        _share_at_or_above(_judged(results, False), threshold),
    )


def _summarise(results: Sequence[ScoredImage]) -> TierSummary:
    scores = [result.score for result in results if result.score is not None]
    return TierSummary(
        count=len(scores),
        unjudged=len(results) - len(scores),
        lowest=min(scores, default=None),
        highest=max(scores, default=None),
        mean=sum(scores) / len(scores) if scores else None,
    )


def summarise_tiers(results: Sequence[ScoredImage]) -> dict[str, TierSummary]:
    return {tier: _summarise([result for result in results if result.image.tier == tier]) for tier in TIERS}


def _percent(share: float | None) -> str:
    return "n/a" if share is None else f"{round(share * PERCENT)}%"


def _format_tier(tier: str, summary: TierSummary) -> str:
    noun = "image " if summary.count == 1 else "images"
    return (
        f"{tier:<14}{summary.count:>4} {noun}   lowest {_percent(summary.lowest):>4}"
        f"   mean {_percent(summary.mean):>4}   highest {_percent(summary.highest):>4}"
    )


def _format_unjudged(results: Sequence[ScoredImage]) -> list[str]:
    unjudged = len([result for result in results if result.score is None])
    if unjudged == 0:
        return []
    noun = "image" if unjudged == 1 else "images"
    return ["", f"{unjudged} {noun} could not be judged and {'is' if unjudged == 1 else 'are'} left out."]


def format_report(results: Sequence[ScoredImage], thresholds: Sequence[float]) -> str:
    summaries = summarise_tiers(results)
    present = [tier for tier in TIERS if any(result.image.tier == tier for result in results)]
    lines = ["Scores per tier", *[_format_tier(tier, summaries[tier]) for tier in present], ""]
    lines.append("limit   failures caught   good prints flagged")
    for rates in (rates_at(results, threshold) for threshold in thresholds):
        lines.append(
            f"{_percent(rates.threshold):>5}   {_percent(rates.detection_rate):>15}   {_percent(rates.false_alarm_rate):>19}"
        )
    return "\n".join([*lines, *_format_unjudged(results)])


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return None


def serve_directory(directory: Path, bind: str, port: int) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(_QuietHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer((bind, port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def parse_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score a labelled set of camera images with a detector.")
    parser.add_argument("manifest", type=Path, help="manifest.json, next to the images it lists")
    parser.add_argument("--detector-url", required=True)
    parser.add_argument("--token-variable", default="", help="the name of the environment variable with the token")
    parser.add_argument("--bind", default="127.0.0.1", help="where this script serves the images")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--address", default="", help="where the detector reaches the images, default http://BIND:PORT")
    parser.add_argument("--thresholds", type=float, nargs="+", default=list(DEFAULT_THRESHOLDS))
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    images = parse_manifest(json.loads(arguments.manifest.read_text()))
    token = os.environ.get(arguments.token_variable, "") if arguments.token_variable else ""
    address = arguments.address or f"http://{arguments.bind}:{arguments.port}"
    server = serve_directory(arguments.manifest.parent, arguments.bind, arguments.port)
    try:
        results = asyncio.run(evaluate(ObicoDetector(arguments.detector_url, token), images, address))
    finally:
        server.shutdown()
    print(format_report(results, arguments.thresholds))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
