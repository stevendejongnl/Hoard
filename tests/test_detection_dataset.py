import csv
import io
import zipfile
from pathlib import Path
from typing import Any

from app.config import settings
from app.db import default_database
from app.detection_dataset import build_dataset_archive


def alert(alert_id: int, verdict: str | None, has_frame: bool = True, score: float = 0.8) -> dict[str, Any]:
    return {
        "id": alert_id,
        "created_at": 1793714520,
        "filename": f"part-{alert_id}.gcode",
        "score": score,
        "verdict": verdict,
        "has_frame": has_frame,
    }


def read_frame_from(frames: dict[int, bytes]):
    def read_frame(alert_id: int) -> bytes | None:
        return frames.get(alert_id)

    return read_frame


def open_archive(archive: bytes) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(archive))


def read_labels(archive: zipfile.ZipFile) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(archive.read("labels.csv").decode())))


def test_a_real_alert_is_a_failure_and_a_false_alarm_is_a_good_print():
    frames = {1: b"a", 2: b"b"}
    archive = open_archive(build_dataset_archive([alert(1, "real"), alert(2, "false_alarm")], read_frame_from(frames)))
    labels = {row["file"]: row["label"] for row in read_labels(archive)}
    assert labels == {"frames/1.jpg": "failure", "frames/2.jpg": "good"}


def test_each_frame_is_in_the_archive_next_to_its_label():
    archive = open_archive(build_dataset_archive([alert(1, "real")], read_frame_from({1: b"jpeg-bytes"})))
    assert archive.read("frames/1.jpg") == b"jpeg-bytes"
    [row] = read_labels(archive)
    assert (row["id"], row["score"], row["print"], row["created_at"]) == ("1", "0.8", "part-1.gcode", "1793714520")


def test_an_alert_without_a_verdict_is_left_out_because_nobody_knows_what_it_shows():
    archive = open_archive(build_dataset_archive([alert(1, None)], read_frame_from({1: b"a"})))
    assert read_labels(archive) == []
    assert archive.namelist() == ["labels.csv"]


def test_an_alert_without_a_frame_is_left_out():
    archive = open_archive(build_dataset_archive([alert(1, "real", has_frame=False)], read_frame_from({})))
    assert read_labels(archive) == []


def test_a_frame_that_cannot_be_read_is_left_out_and_the_rest_stay():
    archive = open_archive(build_dataset_archive([alert(1, "real"), alert(2, "real")], read_frame_from({2: b"b"})))
    assert [row["id"] for row in read_labels(archive)] == ["2"]


def test_an_empty_dataset_is_an_archive_with_only_the_header():
    archive = open_archive(build_dataset_archive([], read_frame_from({})))
    assert archive.read("labels.csv").decode().strip() == "id,file,label,score,print,created_at"


async def test_the_route_serves_the_labelled_frames_as_a_zip(client, tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path / "uploads"))
    alert_id = await default_database.add_detection_alert(1000, "benchy.gcode", 0.8, [])
    frames = tmp_path / "uploads" / "detections"
    frames.mkdir(parents=True)
    (frames / f"{alert_id}.jpg").write_bytes(b"jpeg-bytes")
    await default_database.mark_detection_alert_has_frame(alert_id)
    await default_database.set_detection_verdicts([alert_id], "real")

    response = await client.get("/api/detection/dataset")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    archive = open_archive(response.content)
    assert archive.read(f"frames/{alert_id}.jpg") == b"jpeg-bytes"
