"""How far a print is: the slicer's progress and the position in the gcode file, blended the way Fluidd does it."""


def file_relative_progress(
    file_position: int | None,
    whole_file_progress: float,
    gcode_start_byte: int | None,
    gcode_end_byte: int | None,
) -> float:
    """The position in the gcode body, 0 to 1. The start and end bytes leave out the slicer's header and footer."""
    if file_position is None or gcode_start_byte is None or gcode_end_byte is None:
        return whole_file_progress
    if file_position <= gcode_start_byte:
        return 0
    if file_position >= gcode_end_byte:
        return 1
    return (file_position - gcode_start_byte) / (gcode_end_byte - gcode_start_byte)


def blend_progress(*progress_values: float) -> float:
    """The average of the progress values that are above zero. A value that is not there yet counts as zero."""
    available = [value for value in progress_values if value > 0]
    return sum(available) / len(available) if available else 0
