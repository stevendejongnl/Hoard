"""Suggests a threshold from the alerts that the owner called real or a false alarm."""

from dataclasses import dataclass
from typing import Any

MINIMUM_LABELLED_ALERTS = 3
MARGIN = 0.02
CAP = 0.95


@dataclass(frozen=True)
class ThresholdSuggestion:
    threshold: float
    reason: str


def _scores(alerts: list[dict[str, Any]], verdict: str) -> list[float]:
    return [alert["score"] for alert in alerts if alert["verdict"] == verdict]


def _between(highest_false_alarm: float, lowest_real: float) -> ThresholdSuggestion:
    threshold = round((highest_false_alarm + lowest_real) / 2, 2)
    return ThresholdSuggestion(
        threshold, f"False alarms scored up to {highest_false_alarm}, real failures from {lowest_real}"
    )


def _above(highest_false_alarm: float) -> ThresholdSuggestion:
    threshold = min(round(highest_false_alarm + MARGIN, 2), CAP)
    return ThresholdSuggestion(threshold, f"False alarms scored up to {highest_false_alarm}, none were real")


def suggest_threshold(alerts: list[dict[str, Any]], current: float) -> ThresholdSuggestion | None:
    false_alarms = _scores(alerts, "false_alarm")
    real = _scores(alerts, "real")
    if len(false_alarms) + len(real) < MINIMUM_LABELLED_ALERTS or not false_alarms:
        return None
    if real and max(false_alarms) >= min(real):
        return None
    suggestion = _between(max(false_alarms), min(real)) if real else _above(max(false_alarms))
    return None if abs(suggestion.threshold - current) < MARGIN else suggestion
