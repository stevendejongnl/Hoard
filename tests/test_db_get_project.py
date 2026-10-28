from app import db


async def test_get_project_returns_none_for_unknown_id(tmp_path):
    await db.init_db(str(tmp_path / "unknown.db"))
    assert await db.get_project(99) is None


async def test_get_project_combines_totals_files_links_and_prints(tmp_path):
    await db.init_db(str(tmp_path / "full.db"))
    project = await db.create_project("Benchy")
    first_file = await db.add_project_file(project["id"], "gcode", "a.gcode", "first")
    second_file = await db.add_project_file(project["id"], "stl", "a.stl", None)
    await db.add_project_print(project["id"], first_file["id"], "job1", 100.0, 10.0, 1.0)
    await db.add_project_print(project["id"], first_file["id"], "job2", 300.0, 30.0, 3.0)
    await db.add_project_print(project["id"], None, "job3", 50.0, 5.0, 0.5)
    valid_link = await db.add_project_link(project["id"], "https://example.com/a", "valid")
    broken_link = await db.add_project_link(project["id"], "https://example.com/b", "broken")
    await db.add_project_link(project["id"], "https://example.com/c", "plain")
    await db.set_link_meta(valid_link["id"], '{"title": "A"}')
    await db.set_link_meta(broken_link["id"], "not json")

    result = await db.get_project(project["id"])

    assert result is not None
    assert result["name"] == "Benchy"
    assert result["print_count"] == 3
    assert result["total_duration_s"] == 450.0
    assert result["avg_duration_s"] == 150.0
    assert result["max_duration_s"] == 300.0
    assert result["total_cost"] == 4.5
    assert result["avg_cost"] == 1.5
    assert result["total_filament_g"] == 45.0
    assert [file["id"] for file in result["files"]] == [first_file["id"], second_file["id"]]
    assert result["files"][0] == {
        "id": first_file["id"],
        "project_id": project["id"],
        "type": "gcode",
        "filename": "a.gcode",
        "label": "first",
        "print_count": 2,
        "total_duration_s": 400.0,
        "total_cost": 4.0,
        "total_filament_g": 40.0,
    }
    assert result["files"][1]["print_count"] == 0
    assert result["files"][1]["total_duration_s"] is None
    assert [link["meta"] for link in result["links"]] == [{"title": "A"}, None, None]
    assert [print_row["job_id"] for print_row in result["prints"]] == ["job1", "job2", "job3"]
    assert set(result) >= {"cover_url", "cover_link_id", "notes", "created_at", "files", "links", "prints"}
