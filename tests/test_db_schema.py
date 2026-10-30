import sqlite3

from app import db


def dump_schema(path: str) -> dict[str, dict]:
    connection = sqlite3.connect(path)
    try:
        objects = connection.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
        schema: dict[str, dict] = {}
        for object_type, name, table_name, sql in objects:
            entry: dict = {"type": object_type, "table": table_name, "sql": " ".join((sql or "").split())}
            if object_type == "table":
                entry["columns"] = [tuple(row[1:]) for row in connection.execute(f"PRAGMA table_info({name})")]
            schema[name] = entry
        return schema
    finally:
        connection.close()


OLD_SCHEMA = """
CREATE TABLE spools (
    id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, material TEXT NOT NULL,
    color TEXT NOT NULL, color_hex TEXT, cost_per_gram REAL NOT NULL,
    initial_weight_g REAL NOT NULL, current_weight_g REAL NOT NULL, notes TEXT,
    active INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE print_spools (
    job_id TEXT PRIMARY KEY, spool_id INTEGER REFERENCES spools(id), filament_used_g REAL
);
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE project_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('gcode', 'stl')), filename TEXT NOT NULL, label TEXT
);
CREATE TABLE project_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL, label TEXT
);
CREATE TABLE print_jobs (
    job_id TEXT PRIMARY KEY, notes TEXT, settings TEXT, tags TEXT, created_at INTEGER NOT NULL
);
INSERT INTO spools (brand, material, color, cost_per_gram, initial_weight_g, current_weight_g, active, created_at)
    VALUES ('Prusa', 'PLA', 'Red', 0.02, 1000, 800, 1, 111);
INSERT INTO print_spools VALUES ('job1', 1, 12.5);
INSERT INTO projects (name, notes, created_at) VALUES ('Benchy', 'note', 222);
INSERT INTO project_files (project_id, type, filename, label) VALUES (1, 'gcode', 'a.gcode', 'first');
INSERT INTO project_files (project_id, type, filename, label) VALUES (1, 'stl', 'a.stl', NULL);
INSERT INTO project_links (project_id, url, label) VALUES (1, 'https://example.com', 'link');
INSERT INTO print_jobs (job_id, notes, settings, tags, created_at) VALUES ('job1', 'n', '{"a": 1}', 'x', 333);
"""


def create_old_database(path: str) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(OLD_SCHEMA)
    connection.commit()
    connection.close()


async def test_fresh_database_schema_is_stable(tmp_path):
    path = str(tmp_path / "fresh.db")
    await db.init_db(path)
    assert dump_schema(path) == FRESH_SCHEMA


async def test_init_db_twice_keeps_the_schema(tmp_path):
    path = str(tmp_path / "twice.db")
    await db.init_db(path)
    await db.init_db(path)
    assert dump_schema(path) == FRESH_SCHEMA


async def test_old_database_migrates_to_the_expected_schema(tmp_path):
    path = str(tmp_path / "old.db")
    create_old_database(path)
    await db.init_db(path)
    assert dump_schema(path) == MIGRATED_SCHEMA


async def test_old_database_keeps_every_row_when_migrated(tmp_path):
    path = str(tmp_path / "old_rows.db")
    create_old_database(path)
    await db.init_db(path)
    connection = sqlite3.connect(path)
    try:
        assert connection.execute(
            "SELECT id, brand, material, color, active, created_at, tag_id FROM spools"
        ).fetchall() == [(1, "Prusa", "PLA", "Red", 1, 111, None)]
        assert connection.execute("SELECT * FROM print_spools").fetchall() == [("job1", 1, 12.5)]
        assert connection.execute(
            "SELECT id, name, notes, created_at, cover_url, cover_link_id FROM projects"
        ).fetchall() == [(1, "Benchy", "note", 222, None, None)]
        assert connection.execute("SELECT * FROM project_files ORDER BY id").fetchall() == [
            (1, 1, "gcode", "a.gcode", "first"),
            (2, 1, "stl", "a.stl", None),
        ]
        assert connection.execute("SELECT * FROM project_links").fetchall() == [
            (1, 1, "https://example.com", "link", None)
        ]
        assert connection.execute(
            "SELECT job_id, notes, settings, created_at, gcode_meta, end_time FROM print_jobs"
        ).fetchall() == [("job1", "n", '{"a": 1}', 333, None, None)]
    finally:
        connection.close()


async def test_migrated_database_accepts_any_file_type(tmp_path):
    path = str(tmp_path / "old_types.db")
    create_old_database(path)
    await db.init_db(path)
    created = await db.add_project_file(1, "3mf", "x.3mf", None)
    assert created["type"] == "3mf"


FRESH_SCHEMA: dict[str, dict] = {
    "idx_print_photos_job_id": {
        "sql": "CREATE INDEX idx_print_photos_job_id ON print_photos(job_id)",
        "table": "print_photos",
        "type": "index",
    },
    "idx_project_prints_job_id": {
        "sql": "CREATE INDEX idx_project_prints_job_id ON project_prints(job_id)",
        "table": "project_prints",
        "type": "index",
    },
    "idx_spools_tag_id": {
        "sql": "CREATE UNIQUE INDEX idx_spools_tag_id ON spools(tag_id)",
        "table": "spools",
        "type": "index",
    },
    "print_jobs": {
        "columns": [
            ("job_id", "TEXT", 0, None, 1),
            ("notes", "TEXT", 0, None, 0),
            ("settings", "TEXT", 0, None, 0),
            ("created_at", "INTEGER", 1, None, 0),
            ("gcode_meta", "TEXT", 0, None, 0),
            ("end_time", "INTEGER", 0, None, 0),
        ],
        "sql": "CREATE TABLE print_jobs ( job_id TEXT PRIMARY KEY, notes TEXT, settings TEXT, "
        "created_at INTEGER NOT NULL , gcode_meta TEXT, end_time INTEGER)",
        "table": "print_jobs",
        "type": "table",
    },
    "print_photos": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("job_id", "TEXT", 1, None, 0),
            ("filename", "TEXT", 1, None, 0),
            ("source", "TEXT", 1, None, 0),
            ("captured_at", "INTEGER", 1, None, 0),
        ],
        "sql": "CREATE TABLE print_photos ( id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT "
        "NULL, filename TEXT NOT NULL, source TEXT NOT NULL, captured_at INTEGER NOT NULL )",
        "table": "print_photos",
        "type": "table",
    },
    "print_spools": {
        "columns": [
            ("job_id", "TEXT", 0, None, 1),
            ("spool_id", "INTEGER", 0, None, 0),
            ("filament_used_g", "REAL", 0, None, 0),
        ],
        "sql": "CREATE TABLE print_spools ( job_id TEXT PRIMARY KEY, spool_id INTEGER REFERENCES "
        "spools(id), filament_used_g REAL )",
        "table": "print_spools",
        "type": "table",
    },
    "project_files": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("project_id", "INTEGER", 1, None, 0),
            ("type", "TEXT", 1, None, 0),
            ("filename", "TEXT", 1, None, 0),
            ("label", "TEXT", 0, None, 0),
        ],
        "sql": 'CREATE TABLE "project_files" ( id INTEGER PRIMARY KEY AUTOINCREMENT, project_id '
        "INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, type TEXT NOT NULL, "
        "filename TEXT NOT NULL, label TEXT )",
        "table": "project_files",
        "type": "table",
    },
    "project_links": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("project_id", "INTEGER", 1, None, 0),
            ("url", "TEXT", 1, None, 0),
            ("label", "TEXT", 0, None, 0),
            ("meta", "TEXT", 0, None, 0),
        ],
        "sql": "CREATE TABLE project_links ( id INTEGER PRIMARY KEY AUTOINCREMENT, project_id "
        "INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, url TEXT NOT NULL, "
        "label TEXT , meta TEXT)",
        "table": "project_links",
        "type": "table",
    },
    "project_prints": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("project_id", "INTEGER", 1, None, 0),
            ("project_file_id", "INTEGER", 0, None, 0),
            ("job_id", "TEXT", 1, None, 0),
            ("duration_s", "REAL", 0, None, 0),
            ("filament_g", "REAL", 0, None, 0),
            ("cost_total", "REAL", 0, None, 0),
        ],
        "sql": "CREATE TABLE project_prints ( id INTEGER PRIMARY KEY AUTOINCREMENT, project_id "
        "INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, project_file_id "
        "INTEGER REFERENCES project_files(id) ON DELETE SET NULL, job_id TEXT NOT NULL, "
        "duration_s REAL, filament_g REAL, cost_total REAL, UNIQUE(project_id, job_id) )",
        "table": "project_prints",
        "type": "table",
    },
    "projects": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("name", "TEXT", 1, None, 0),
            ("notes", "TEXT", 0, None, 0),
            ("created_at", "INTEGER", 1, None, 0),
            ("cover_url", "TEXT", 0, None, 0),
            ("cover_link_id", "INTEGER", 0, None, 0),
        ],
        "sql": "CREATE TABLE projects ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, "
        "notes TEXT, created_at INTEGER NOT NULL , cover_url TEXT, cover_link_id INTEGER)",
        "table": "projects",
        "type": "table",
    },
    "hidden_system_rows": {
        "type": "table",
        "table": "hidden_system_rows",
        "sql": "CREATE TABLE hidden_system_rows ( key TEXT PRIMARY KEY )",
        "columns": [("key", "TEXT", 0, None, 1)],
    },
    "system_faults": {
        "type": "table",
        "table": "system_faults",
        "sql": "CREATE TABLE system_faults ( id INTEGER PRIMARY KEY "
        "AUTOINCREMENT, key TEXT NOT NULL, severity TEXT NOT NULL, source "
        "TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, "
        "first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, "
        "cleared_at INTEGER )",
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("key", "TEXT", 1, None, 0),
            ("severity", "TEXT", 1, None, 0),
            ("source", "TEXT", 1, None, 0),
            ("title", "TEXT", 1, None, 0),
            ("detail", "TEXT", 1, None, 0),
            ("first_seen", "INTEGER", 1, None, 0),
            ("last_seen", "INTEGER", 1, None, 0),
            ("cleared_at", "INTEGER", 0, None, 0),
        ],
    },
    "push_subscriptions": {
        "columns": [
            ("endpoint", "TEXT", 0, None, 1),
            ("p256dh", "TEXT", 1, None, 0),
            ("auth", "TEXT", 1, None, 0),
            ("created_at", "INTEGER", 1, None, 0),
        ],
        "sql": "CREATE TABLE push_subscriptions ( endpoint TEXT PRIMARY KEY, p256dh TEXT NOT "
        "NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL )",
        "table": "push_subscriptions",
        "type": "table",
    },
    "spools": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("brand", "TEXT", 1, None, 0),
            ("material", "TEXT", 1, None, 0),
            ("color", "TEXT", 1, None, 0),
            ("color_hex", "TEXT", 0, None, 0),
            ("cost_per_gram", "REAL", 1, None, 0),
            ("initial_weight_g", "REAL", 1, None, 0),
            ("current_weight_g", "REAL", 1, None, 0),
            ("notes", "TEXT", 0, None, 0),
            ("active", "INTEGER", 1, "0", 0),
            ("created_at", "INTEGER", 1, None, 0),
            ("tag_id", "TEXT", 0, None, 0),
        ],
        "sql": "CREATE TABLE spools ( id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, "
        "material TEXT NOT NULL, color TEXT NOT NULL, color_hex TEXT, cost_per_gram REAL NOT "
        "NULL, initial_weight_g REAL NOT NULL, current_weight_g REAL NOT NULL, notes TEXT, active "
        "INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL , tag_id TEXT)",
        "table": "spools",
        "type": "table",
    },
}

MIGRATED_SCHEMA: dict[str, dict] = {
    "idx_print_photos_job_id": {
        "sql": "CREATE INDEX idx_print_photos_job_id ON print_photos(job_id)",
        "table": "print_photos",
        "type": "index",
    },
    "idx_project_prints_job_id": {
        "sql": "CREATE INDEX idx_project_prints_job_id ON project_prints(job_id)",
        "table": "project_prints",
        "type": "index",
    },
    "idx_spools_tag_id": {
        "sql": "CREATE UNIQUE INDEX idx_spools_tag_id ON spools(tag_id)",
        "table": "spools",
        "type": "index",
    },
    "print_jobs": {
        "columns": [
            ("job_id", "TEXT", 0, None, 1),
            ("notes", "TEXT", 0, None, 0),
            ("settings", "TEXT", 0, None, 0),
            ("created_at", "INTEGER", 1, None, 0),
            ("gcode_meta", "TEXT", 0, None, 0),
            ("end_time", "INTEGER", 0, None, 0),
        ],
        "sql": "CREATE TABLE print_jobs ( job_id TEXT PRIMARY KEY, notes TEXT, settings TEXT, "
        "created_at INTEGER NOT NULL , gcode_meta TEXT, end_time INTEGER)",
        "table": "print_jobs",
        "type": "table",
    },
    "print_photos": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("job_id", "TEXT", 1, None, 0),
            ("filename", "TEXT", 1, None, 0),
            ("source", "TEXT", 1, None, 0),
            ("captured_at", "INTEGER", 1, None, 0),
        ],
        "sql": "CREATE TABLE print_photos ( id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT "
        "NULL, filename TEXT NOT NULL, source TEXT NOT NULL, captured_at INTEGER NOT NULL )",
        "table": "print_photos",
        "type": "table",
    },
    "print_spools": {
        "columns": [
            ("job_id", "TEXT", 0, None, 1),
            ("spool_id", "INTEGER", 0, None, 0),
            ("filament_used_g", "REAL", 0, None, 0),
        ],
        "sql": "CREATE TABLE print_spools ( job_id TEXT PRIMARY KEY, spool_id INTEGER REFERENCES "
        "spools(id), filament_used_g REAL )",
        "table": "print_spools",
        "type": "table",
    },
    "project_files": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("project_id", "INTEGER", 1, None, 0),
            ("type", "TEXT", 1, None, 0),
            ("filename", "TEXT", 1, None, 0),
            ("label", "TEXT", 0, None, 0),
        ],
        "sql": 'CREATE TABLE "project_files" ( id INTEGER PRIMARY KEY AUTOINCREMENT, project_id '
        "INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, type TEXT NOT NULL, "
        "filename TEXT NOT NULL, label TEXT )",
        "table": "project_files",
        "type": "table",
    },
    "project_links": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("project_id", "INTEGER", 1, None, 0),
            ("url", "TEXT", 1, None, 0),
            ("label", "TEXT", 0, None, 0),
            ("meta", "TEXT", 0, None, 0),
        ],
        "sql": "CREATE TABLE project_links ( id INTEGER PRIMARY KEY AUTOINCREMENT, project_id "
        "INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, url TEXT NOT NULL, "
        "label TEXT , meta TEXT)",
        "table": "project_links",
        "type": "table",
    },
    "project_prints": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("project_id", "INTEGER", 1, None, 0),
            ("project_file_id", "INTEGER", 0, None, 0),
            ("job_id", "TEXT", 1, None, 0),
            ("duration_s", "REAL", 0, None, 0),
            ("filament_g", "REAL", 0, None, 0),
            ("cost_total", "REAL", 0, None, 0),
        ],
        "sql": "CREATE TABLE project_prints ( id INTEGER PRIMARY KEY AUTOINCREMENT, project_id "
        "INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, project_file_id "
        "INTEGER REFERENCES project_files(id) ON DELETE SET NULL, job_id TEXT NOT NULL, "
        "duration_s REAL, filament_g REAL, cost_total REAL, UNIQUE(project_id, job_id) )",
        "table": "project_prints",
        "type": "table",
    },
    "projects": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("name", "TEXT", 1, None, 0),
            ("notes", "TEXT", 0, None, 0),
            ("created_at", "INTEGER", 1, None, 0),
            ("cover_url", "TEXT", 0, None, 0),
            ("cover_link_id", "INTEGER", 0, None, 0),
        ],
        "sql": "CREATE TABLE projects ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, "
        "notes TEXT, created_at INTEGER NOT NULL , cover_url TEXT, cover_link_id INTEGER)",
        "table": "projects",
        "type": "table",
    },
    "hidden_system_rows": {
        "type": "table",
        "table": "hidden_system_rows",
        "sql": "CREATE TABLE hidden_system_rows ( key TEXT PRIMARY KEY )",
        "columns": [("key", "TEXT", 0, None, 1)],
    },
    "system_faults": {
        "type": "table",
        "table": "system_faults",
        "sql": "CREATE TABLE system_faults ( id INTEGER PRIMARY KEY "
        "AUTOINCREMENT, key TEXT NOT NULL, severity TEXT NOT NULL, source "
        "TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, "
        "first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, "
        "cleared_at INTEGER )",
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("key", "TEXT", 1, None, 0),
            ("severity", "TEXT", 1, None, 0),
            ("source", "TEXT", 1, None, 0),
            ("title", "TEXT", 1, None, 0),
            ("detail", "TEXT", 1, None, 0),
            ("first_seen", "INTEGER", 1, None, 0),
            ("last_seen", "INTEGER", 1, None, 0),
            ("cleared_at", "INTEGER", 0, None, 0),
        ],
    },
    "push_subscriptions": {
        "columns": [
            ("endpoint", "TEXT", 0, None, 1),
            ("p256dh", "TEXT", 1, None, 0),
            ("auth", "TEXT", 1, None, 0),
            ("created_at", "INTEGER", 1, None, 0),
        ],
        "sql": "CREATE TABLE push_subscriptions ( endpoint TEXT PRIMARY KEY, p256dh TEXT NOT "
        "NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL )",
        "table": "push_subscriptions",
        "type": "table",
    },
    "spools": {
        "columns": [
            ("id", "INTEGER", 0, None, 1),
            ("brand", "TEXT", 1, None, 0),
            ("material", "TEXT", 1, None, 0),
            ("color", "TEXT", 1, None, 0),
            ("color_hex", "TEXT", 0, None, 0),
            ("cost_per_gram", "REAL", 1, None, 0),
            ("initial_weight_g", "REAL", 1, None, 0),
            ("current_weight_g", "REAL", 1, None, 0),
            ("notes", "TEXT", 0, None, 0),
            ("active", "INTEGER", 1, "0", 0),
            ("created_at", "INTEGER", 1, None, 0),
            ("tag_id", "TEXT", 0, None, 0),
        ],
        "sql": "CREATE TABLE spools ( id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, "
        "material TEXT NOT NULL, color TEXT NOT NULL, color_hex TEXT, cost_per_gram REAL NOT "
        "NULL, initial_weight_g REAL NOT NULL, current_weight_g REAL NOT NULL, notes TEXT, active "
        "INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL , tag_id TEXT)",
        "table": "spools",
        "type": "table",
    },
}
