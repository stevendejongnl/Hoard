from app.print_progress import blend_progress, file_relative_progress


def test_the_file_progress_counts_from_the_start_of_the_gcode_to_its_end() -> None:
    progress = file_relative_progress(
        file_position=51_000, whole_file_progress=0.4, gcode_start_byte=1_000, gcode_end_byte=101_000
    )
    assert progress == 0.5


def test_at_or_before_the_start_of_the_gcode_the_file_progress_is_zero() -> None:
    for position in (1_000, 500):
        progress = file_relative_progress(
            file_position=position, whole_file_progress=0.4, gcode_start_byte=1_000, gcode_end_byte=101_000
        )
        assert progress == 0


def test_at_or_after_the_end_of_the_gcode_the_file_progress_is_complete() -> None:
    for position in (101_000, 200_000):
        progress = file_relative_progress(
            file_position=position, whole_file_progress=0.4, gcode_start_byte=1_000, gcode_end_byte=101_000
        )
        assert progress == 1


def test_without_the_gcode_bytes_the_file_progress_is_the_progress_of_the_whole_file() -> None:
    progress = file_relative_progress(
        file_position=51_000, whole_file_progress=0.4, gcode_start_byte=None, gcode_end_byte=None
    )
    assert progress == 0.4


def test_without_a_file_position_the_file_progress_is_the_progress_of_the_whole_file() -> None:
    progress = file_relative_progress(
        file_position=None, whole_file_progress=0.4, gcode_start_byte=1_000, gcode_end_byte=101_000
    )
    assert progress == 0.4


def test_the_blend_is_the_average_of_the_progress_values_above_zero() -> None:
    assert blend_progress(0.6, 0.4) == 0.5


def test_the_blend_ignores_a_value_that_is_not_available_yet() -> None:
    assert blend_progress(0, 0.4) == 0.4
    assert blend_progress(0.6, 0) == 0.6


def test_the_blend_of_nothing_is_zero() -> None:
    assert blend_progress(0, 0) == 0
    assert blend_progress() == 0
