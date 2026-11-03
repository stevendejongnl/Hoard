"""The alerts that the owner labelled, with their camera frames, as a dataset to train a detector on."""

import csv
import io
import zipfile
from collections.abc import Callable, Sequence
from typing import Any

HEADER = ["id", "file", "label", "score", "print", "created_at"]
# What the frame shows: a real alert shows a failure, a false alarm shows a print that is fine.
LABEL_OF_VERDICT = {"real": "failure", "false_alarm": "good"}


def _frame_file(alert_id: int) -> str:
    return f"frames/{alert_id}.jpg"


def build_dataset_archive(alerts: Sequence[dict[str, Any]], read_frame: Callable[[int], bytes | None]) -> bytes:
    """A zip with labels.csv and a folder of frames. Alerts without a verdict or without a frame are left out."""
    rows: list[list[Any]] = []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as archive:
        for alert in alerts:
            frame = read_frame(alert["id"]) if alert["has_frame"] and alert["verdict"] else None
            if frame is None:
                continue
            archive.writestr(_frame_file(alert["id"]), frame)
            rows.append(
                [
                    alert["id"],
                    _frame_file(alert["id"]),
                    LABEL_OF_VERDICT[alert["verdict"]],
                    alert["score"],
                    alert["filename"],
                    alert["created_at"],
                ]
            )
        labels = io.StringIO()
        csv.writer(labels, lineterminator="\n").writerows([HEADER, *rows])
        archive.writestr("labels.csv", labels.getvalue())
    return buffer.getvalue()
