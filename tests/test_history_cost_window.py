from datetime import UTC, datetime, timedelta

from app.routes.history import COST_WINDOW_MARGIN, find_cost_window

FIRST_END = 1_761_650_000
LAST_END = 1_761_700_000


def create_job(end_time: float | None, status: str = "completed") -> dict:
    return {"job_id": "job", "status": status, "end_time": end_time}


def test_there_is_no_window_without_jobs() -> None:
    assert find_cost_window([]) is None


def test_there_is_no_window_when_no_job_is_completed() -> None:
    assert find_cost_window([create_job(FIRST_END, "cancelled"), create_job(None)]) is None


def test_the_window_runs_from_the_first_to_the_last_end_time_with_a_margin() -> None:
    window = find_cost_window([create_job(LAST_END), create_job(FIRST_END), create_job(1, "cancelled")])
    assert window == (
        datetime.fromtimestamp(FIRST_END, UTC) - COST_WINDOW_MARGIN,
        datetime.fromtimestamp(LAST_END, UTC) + COST_WINDOW_MARGIN,
    )


def test_the_margin_is_longer_than_the_five_minutes_in_which_a_cost_record_is_matched() -> None:
    assert COST_WINDOW_MARGIN > timedelta(minutes=5)
