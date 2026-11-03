from app.threshold_tuning import suggest_threshold


def alerts(false_alarms: list[float], real: list[float]) -> list[dict]:
    return [{"score": score, "verdict": "false_alarm"} for score in false_alarms] + [
        {"score": score, "verdict": "real"} for score in real
    ]


def test_too_few_labelled_alerts_give_no_suggestion():
    assert suggest_threshold(alerts([0.6, 0.7], []), current=0.5) is None


def test_alerts_without_a_verdict_are_not_counted():
    unlabelled = [{"score": 0.9, "verdict": None}] * 5
    assert suggest_threshold(unlabelled, current=0.5) is None


def test_only_false_alarms_suggest_a_threshold_just_above_the_highest():
    suggestion = suggest_threshold(alerts([0.55, 0.6, 0.62], []), current=0.5)
    assert suggestion is not None
    assert suggestion.threshold == 0.64
    assert suggestion.reason


def test_false_alarms_below_the_real_failures_suggest_a_threshold_between_them():
    suggestion = suggest_threshold(alerts([0.55, 0.6, 0.6], [0.8, 0.9]), current=0.5)
    assert suggestion is not None
    assert suggestion.threshold == 0.7


def test_scores_that_overlap_give_no_suggestion():
    assert suggest_threshold(alerts([0.55, 0.85, 0.6], [0.8, 0.9]), current=0.5) is None


def test_a_threshold_that_is_already_right_gives_no_suggestion():
    assert suggest_threshold(alerts([0.55, 0.6, 0.6], [0.8, 0.9]), current=0.7) is None


def test_the_suggestion_never_goes_above_the_cap():
    suggestion = suggest_threshold(alerts([0.97, 0.98, 0.99], []), current=0.5)
    assert suggestion is not None
    assert suggestion.threshold == 0.95


def test_only_real_failures_give_no_suggestion():
    assert suggest_threshold(alerts([], [0.8, 0.9, 0.85]), current=0.5) is None
