from app.frame_rate import FrameRateMeter, FrameRates


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def test_without_frames_there_is_no_rate():
    assert FrameRateMeter(clock=FakeClock()).frames_per_second() is None


def test_one_frame_is_not_enough_to_measure_a_rate():
    meter = FrameRateMeter(clock=FakeClock())
    meter.note_frame()
    assert meter.frames_per_second() is None


def test_the_rate_is_the_number_of_intervals_over_the_time_they_took():
    clock = FakeClock()
    meter = FrameRateMeter(clock=clock)
    for _ in range(11):
        meter.note_frame()
        clock.now += 0.1
    assert meter.frames_per_second() == 10.0


def test_frames_older_than_the_window_are_forgotten():
    clock = FakeClock()
    meter = FrameRateMeter(window_seconds=5.0, clock=clock)
    for _ in range(50):
        meter.note_frame()
        clock.now += 0.02
    clock.now += 10
    for _ in range(3):
        meter.note_frame()
        clock.now += 0.5
    assert meter.frames_per_second() == 2.0


def test_a_stream_that_stopped_has_no_rate_any_more():
    clock = FakeClock()
    meter = FrameRateMeter(window_seconds=5.0, clock=clock)
    for _ in range(10):
        meter.note_frame()
        clock.now += 0.1
    clock.now += 6
    assert meter.frames_per_second() is None


def test_every_camera_has_its_own_rate():
    clock = FakeClock()
    rates = FrameRates(clock=clock)
    for _ in range(5):
        rates.note_frame(0)
        clock.now += 0.1
    rates.note_frame(1)
    assert rates.measured(0) is not None
    assert rates.measured(1) is None
    assert rates.measured(2) is None
