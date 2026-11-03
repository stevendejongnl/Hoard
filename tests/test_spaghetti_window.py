from app.spaghetti_watch import FailureWindow


def fill(window: FailureWindow, scores: list[float]) -> None:
    for score in scores:
        window.record(score)


def test_an_empty_window_is_not_failing():
    assert not FailureWindow(size=5, required=3, threshold=0.5).is_failing()


def test_enough_frames_above_the_threshold_make_the_window_fail():
    window = FailureWindow(size=5, required=3, threshold=0.5)
    fill(window, [0.9, 0.1, 0.8, 0.7])
    assert window.is_failing()


def test_too_few_frames_above_the_threshold_do_not_make_it_fail():
    window = FailureWindow(size=5, required=3, threshold=0.5)
    fill(window, [0.9, 0.1, 0.8, 0.2])
    assert not window.is_failing()


def test_a_score_equal_to_the_threshold_counts():
    window = FailureWindow(size=3, required=2, threshold=0.5)
    fill(window, [0.5, 0.5])
    assert window.is_failing()


def test_old_frames_drop_out_of_the_window():
    window = FailureWindow(size=3, required=2, threshold=0.5)
    fill(window, [0.9, 0.9, 0.1, 0.1])
    assert not window.is_failing()


def test_clear_forgets_the_frames_of_an_earlier_print():
    window = FailureWindow(size=3, required=2, threshold=0.5)
    fill(window, [0.9, 0.9])
    window.clear()
    assert not window.is_failing()
