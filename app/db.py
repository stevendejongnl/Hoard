import json
import time
from collections.abc import Callable
from typing import Any

import aiosqlite


async def _add_column_if_missing(connection: aiosqlite.Connection, table: str, column: str, definition: str) -> None:
    try:
        await connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except Exception:
        pass  # column already exists


async def _create_spools(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS spools (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            brand            TEXT    NOT NULL,
            material         TEXT    NOT NULL,
            color            TEXT    NOT NULL,
            color_hex        TEXT,
            cost_per_gram    REAL    NOT NULL,
            initial_weight_g REAL    NOT NULL,
            current_weight_g REAL    NOT NULL,
            notes            TEXT,
            active           INTEGER NOT NULL DEFAULT 0,
            created_at       INTEGER NOT NULL
        )
    """)
    async with connection.execute("PRAGMA table_info(spools)") as cursor:
        spool_columns = [row[1] for row in await cursor.fetchall()]
    if "tag_id" not in spool_columns:
        await connection.execute("ALTER TABLE spools ADD COLUMN tag_id TEXT")
    await connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_spools_tag_id ON spools(tag_id)")


async def _create_print_spools(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS print_spools (
            job_id          TEXT PRIMARY KEY,
            spool_id        INTEGER REFERENCES spools(id),
            filament_used_g REAL
        )
    """)


async def _create_projects(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    NOT NULL,
            notes      TEXT,
            created_at INTEGER NOT NULL
        )
    """)


async def _create_project_files(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS project_files (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            type       TEXT    NOT NULL CHECK(type IN ('gcode', 'stl')),
            filename   TEXT    NOT NULL,
            label      TEXT
        )
    """)


async def _project_files_has_type_check(connection: aiosqlite.Connection) -> bool:
    async with connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='project_files'"
    ) as cursor:
        row = await cursor.fetchone()
    return bool(row and "CHECK" in (row[0] or ""))


async def _drop_project_files_type_check(connection: aiosqlite.Connection) -> None:
    """Migrate project_files to drop the CHECK constraint so any file extension is allowed."""
    if not await _project_files_has_type_check(connection):
        return
    await connection.execute("""
        CREATE TABLE project_files_new (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            type       TEXT    NOT NULL,
            filename   TEXT    NOT NULL,
            label      TEXT
        )
    """)
    await connection.execute("INSERT INTO project_files_new SELECT * FROM project_files")
    await connection.execute("DROP TABLE project_files")
    await connection.execute("ALTER TABLE project_files_new RENAME TO project_files")


async def _create_project_links(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS project_links (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            url        TEXT    NOT NULL,
            label      TEXT
        )
    """)


async def _add_enrichment_columns(connection: aiosqlite.Connection) -> None:
    await _add_column_if_missing(connection, "project_links", "meta", "TEXT")
    await _add_column_if_missing(connection, "projects", "cover_url", "TEXT")
    await _add_column_if_missing(connection, "projects", "cover_link_id", "INTEGER")


async def _create_project_prints(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS project_prints (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            project_file_id INTEGER REFERENCES project_files(id) ON DELETE SET NULL,
            job_id          TEXT    NOT NULL,
            duration_s      REAL,
            filament_g      REAL,
            cost_total      REAL,
            UNIQUE(project_id, job_id)
        )
    """)


async def _create_print_jobs(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS print_jobs (
            job_id      TEXT PRIMARY KEY,
            notes       TEXT,
            settings    TEXT,
            created_at  INTEGER NOT NULL
        )
    """)


async def _create_print_photos(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS print_photos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id      TEXT    NOT NULL,
            filename    TEXT    NOT NULL,
            source      TEXT    NOT NULL,
            captured_at INTEGER NOT NULL
        )
    """)


async def _migrate_print_jobs_columns(connection: aiosqlite.Connection) -> None:
    """gcode_meta stores slicer metadata as JSON, end_time the unix time a print completed."""
    await _add_column_if_missing(connection, "print_jobs", "gcode_meta", "TEXT")
    try:
        await connection.execute("ALTER TABLE print_jobs DROP COLUMN tags")  # tags is no longer used
    except Exception:
        pass  # column already dropped or never existed
    await _add_column_if_missing(connection, "print_jobs", "end_time", "INTEGER")


async def _create_push_subscriptions(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            endpoint   TEXT PRIMARY KEY,
            p256dh     TEXT NOT NULL,
            auth       TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)


async def _create_system_tables(connection: aiosqlite.Connection) -> None:
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS system_faults (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            key        TEXT NOT NULL,
            severity   TEXT NOT NULL,
            source     TEXT NOT NULL,
            title      TEXT NOT NULL,
            detail     TEXT NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen  INTEGER NOT NULL,
            cleared_at INTEGER
        )
    """)
    await connection.execute("""
        CREATE TABLE IF NOT EXISTS hidden_system_rows (
            key TEXT PRIMARY KEY
        )
    """)


async def _create_indexes(connection: aiosqlite.Connection) -> None:
    await connection.execute("CREATE INDEX IF NOT EXISTS idx_print_photos_job_id ON print_photos(job_id)")
    await connection.execute("CREATE INDEX IF NOT EXISTS idx_project_prints_job_id ON project_prints(job_id)")


async def _fetch_project_totals(connection: aiosqlite.Connection, project_id: int) -> dict[str, Any] | None:
    async with connection.execute(
        """SELECT p.*,
                  COALESCE(COUNT(pp.id), 0)  AS print_count,
                  SUM(pp.duration_s)          AS total_duration_s,
                  AVG(pp.duration_s)          AS avg_duration_s,
                  MAX(pp.duration_s)          AS max_duration_s,
                  SUM(pp.cost_total)           AS total_cost,
                  AVG(pp.cost_total)           AS avg_cost,
                  SUM(pp.filament_g)           AS total_filament_g
           FROM projects p
           LEFT JOIN project_prints pp ON pp.project_id = p.id
           WHERE p.id = ?
           GROUP BY p.id""",
        (project_id,),
    ) as cursor:
        row = await cursor.fetchone()
    return dict(row) if row else None


async def _fetch_file_with_stats(connection: aiosqlite.Connection, file_row: dict[str, Any]) -> dict[str, Any]:
    async with connection.execute(
        """SELECT COALESCE(COUNT(id), 0) AS print_count,
                  SUM(duration_s)         AS total_duration_s,
                  SUM(cost_total)          AS total_cost,
                  SUM(filament_g)          AS total_filament_g
           FROM project_prints WHERE project_file_id = ?""",
        (file_row["id"],),
    ) as cursor:
        stats = await cursor.fetchone()
    if stats is None:
        return file_row
    return {**file_row, **dict(stats)}


async def _fetch_project_files(connection: aiosqlite.Connection, project_id: int) -> list[dict[str, Any]]:
    async with connection.execute(
        "SELECT * FROM project_files WHERE project_id = ? ORDER BY id",
        (project_id,),
    ) as cursor:
        file_rows = [dict(row) for row in await cursor.fetchall()]
    return [await _fetch_file_with_stats(connection, file_row) for file_row in file_rows]


def _parse_link_meta(link: dict[str, Any]) -> dict[str, Any]:
    if not link.get("meta"):
        return link
    try:
        return {**link, "meta": json.loads(link["meta"])}
    except Exception:
        return {**link, "meta": None}


async def _fetch_project_links(connection: aiosqlite.Connection, project_id: int) -> list[dict[str, Any]]:
    async with connection.execute(
        "SELECT * FROM project_links WHERE project_id = ? ORDER BY id",
        (project_id,),
    ) as cursor:
        return [_parse_link_meta(dict(row)) for row in await cursor.fetchall()]


async def _fetch_project_prints(connection: aiosqlite.Connection, project_id: int) -> list[dict[str, Any]]:
    async with connection.execute(
        "SELECT * FROM project_prints WHERE project_id = ? ORDER BY id",
        (project_id,),
    ) as cursor:
        return [dict(row) for row in await cursor.fetchall()]


class Database:
    """The SQLite database of Hoard. Every query opens its own connection through `connect`, so how connections are
    made can be injected: a test or another caller creates its own Database for its own file."""

    def __init__(
        self,
        path: str = "",
        connect: Callable[..., aiosqlite.Connection] = aiosqlite.connect,
        timeout: float = 5,
    ) -> None:
        self.path = path
        self._connect = connect
        self._timeout = timeout

    async def initialise(self) -> None:
        async with self._connect(self.path) as connection:
            await connection.execute("PRAGMA journal_mode=WAL")
            await connection.execute("PRAGMA busy_timeout=5000")
            await _create_spools(connection)
            await _create_print_spools(connection)
            await _create_projects(connection)
            await _create_project_files(connection)
            await _drop_project_files_type_check(connection)
            await _create_project_links(connection)
            await _add_enrichment_columns(connection)
            await connection.commit()
            await _create_project_prints(connection)
            await connection.commit()
            await _create_print_jobs(connection)
            await _create_print_photos(connection)
            await connection.commit()
            await _migrate_print_jobs_columns(connection)
            await connection.commit()
            await _create_push_subscriptions(connection)
            await connection.commit()
            await _create_system_tables(connection)
            await connection.commit()
            await _create_indexes(connection)
            await connection.commit()

    def open_connection(self) -> aiosqlite.Connection:
        return self._connect(self.path, timeout=self._timeout)

    async def record_system_faults(self, faults: list[dict[str, Any]], now: int) -> None:
        """Brings the open faults in line with what is wrong now: new ones start, gone ones are cleared."""
        async with self.open_connection() as connection:
            await self._clear_gone_system_faults(connection, [fault["key"] for fault in faults], now)
            for fault in faults:
                await self._save_system_fault(connection, fault, now)
            await connection.commit()

    async def _clear_gone_system_faults(self, connection: aiosqlite.Connection, keys: list[str], now: int) -> None:
        placeholders = ",".join("?" for _ in keys)
        await connection.execute(
            f"UPDATE system_faults SET cleared_at = ? WHERE cleared_at IS NULL AND key NOT IN ({placeholders})",
            (now, *keys),
        )

    async def _save_system_fault(self, connection: aiosqlite.Connection, fault: dict[str, Any], now: int) -> None:
        cursor = await connection.execute(
            "UPDATE system_faults SET last_seen = ?, detail = ? WHERE cleared_at IS NULL AND key = ?",
            (now, fault["detail"], fault["key"]),
        )
        if cursor.rowcount > 0:
            return
        await connection.execute(
            """INSERT INTO system_faults (key, severity, source, title, detail, first_seen, last_seen)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (fault["key"], fault["severity"], fault["source"], fault["title"], fault["detail"], now, now),
        )

    async def list_system_faults(self, limit: int = 100) -> list[dict[str, Any]]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute(
                "SELECT * FROM system_faults ORDER BY first_seen DESC, id DESC LIMIT ?", (limit,)
            ) as cursor:
                return [dict(row) for row in await cursor.fetchall()]

    async def prune_system_faults(self, keep: int = 500) -> None:
        async with self.open_connection() as connection:
            await connection.execute(
                """DELETE FROM system_faults WHERE cleared_at IS NOT NULL AND id NOT IN
                   (SELECT id FROM system_faults ORDER BY first_seen DESC, id DESC LIMIT ?)""",
                (keep,),
            )
            await connection.commit()

    async def list_hidden_system_rows(self) -> list[str]:
        async with (
            self.open_connection() as connection,
            connection.execute("SELECT key FROM hidden_system_rows") as cursor,
        ):
            return [row[0] for row in await cursor.fetchall()]

    async def set_hidden_system_rows(self, keys: list[str]) -> None:
        async with self.open_connection() as connection:
            await connection.execute("DELETE FROM hidden_system_rows")
            await connection.executemany(
                "INSERT OR IGNORE INTO hidden_system_rows (key) VALUES (?)", [(key,) for key in keys]
            )
            await connection.commit()

    async def get_active_spool(self) -> dict[str, Any] | None:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute("SELECT * FROM spools WHERE active = 1 LIMIT 1") as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def list_spools(self) -> list[dict[str, Any]]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute("SELECT * FROM spools ORDER BY active DESC, created_at DESC") as cursor:
                return [dict(row) for row in await cursor.fetchall()]

    async def create_spool(self, data: dict[str, Any]) -> dict[str, Any]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            cursor = await connection.execute(
                """INSERT INTO spools
                   (brand, material, color, color_hex, cost_per_gram,
                    initial_weight_g, current_weight_g, notes, active, tag_id, created_at)
                   VALUES (:brand, :material, :color, :color_hex, :cost_per_gram,
                           :initial_weight_g, :current_weight_g, :notes, :active, :tag_id, :created_at)""",
                {**data, "active": data.get("active", 0), "tag_id": data.get("tag_id"), "created_at": int(time.time())},
            )
            await connection.commit()
            async with connection.execute("SELECT * FROM spools WHERE id = ?", (cursor.lastrowid,)) as lookup_cursor:
                row = await lookup_cursor.fetchone()
                assert row is not None
                return dict(row)

    async def find_spool_by_tag(self, tag_id: str) -> dict[str, Any] | None:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute("SELECT * FROM spools WHERE tag_id = ?", (tag_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_spool(self, spool_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            if data.get("active"):
                await connection.execute("UPDATE spools SET active = 0")
            assignments = ", ".join(f"{column} = :{column}" for column in data)
            await connection.execute(
                f"UPDATE spools SET {assignments} WHERE id = :_id",
                {**data, "_id": spool_id},
            )
            await connection.commit()
            async with connection.execute("SELECT * FROM spools WHERE id = ?", (spool_id,)) as lookup_cursor:
                row = await lookup_cursor.fetchone()
                return dict(row) if row else None

    async def delete_spool(self, spool_id: int) -> bool:
        async with self.open_connection() as connection:
            async with connection.execute(
                "SELECT 1 FROM print_spools WHERE spool_id = ? LIMIT 1", (spool_id,)
            ) as cursor:
                if await cursor.fetchone():
                    return False
            await connection.execute("DELETE FROM spools WHERE id = ?", (spool_id,))
            await connection.commit()
            return True

    async def deduct_spool_weight(self, spool_id: int, grams: float) -> None:
        async with self.open_connection() as connection:
            await connection.execute(
                "UPDATE spools SET current_weight_g = MAX(0, current_weight_g - ?) WHERE id = ?",
                (grams, spool_id),
            )
            await connection.commit()

    async def link_print_spool(self, job_id: str, spool_id: int | None, filament_used_g: float) -> None:
        async with self.open_connection() as connection:
            await connection.execute(
                """INSERT INTO print_spools (job_id, spool_id, filament_used_g)
                   VALUES (?, ?, ?)
                   ON CONFLICT(job_id) DO UPDATE SET spool_id=excluded.spool_id,
                   filament_used_g=excluded.filament_used_g""",
                (job_id, spool_id, filament_used_g),
            )
            await connection.commit()

    async def _list_all_print_spools(self) -> list[dict[str, Any]]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute("SELECT job_id, spool_id, filament_used_g FROM print_spools") as cursor:
                return [dict(row) for row in await cursor.fetchall()]

    async def get_print_spool(self, job_id: str) -> dict[str, Any] | None:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute(
                """SELECT ps.*, s.brand, s.material, s.color, s.color_hex, s.cost_per_gram
                   FROM print_spools ps
                   LEFT JOIN spools s ON s.id = ps.spool_id
                   WHERE ps.job_id = ?""",
                (job_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def list_projects(self) -> list[dict[str, Any]]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute(
                """SELECT p.*,
                          COALESCE(COUNT(pp.id), 0)  AS print_count,
                          SUM(pp.duration_s)          AS total_duration_s,
                          AVG(pp.duration_s)          AS avg_duration_s,
                          MAX(pp.duration_s)          AS max_duration_s,
                          SUM(pp.cost_total)           AS total_cost,
                          AVG(pp.cost_total)           AS avg_cost,
                          SUM(pp.filament_g)           AS total_filament_g,
                          MAX(pp.job_id)              AS last_job_id
                   FROM projects p
                   LEFT JOIN project_prints pp ON pp.project_id = p.id
                   GROUP BY p.id
                   ORDER BY last_job_id DESC NULLS LAST, p.created_at DESC"""
            ) as cursor:
                return [dict(row) for row in await cursor.fetchall()]

    async def get_project(self, project_id: int) -> dict[str, Any] | None:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            project = await _fetch_project_totals(connection, project_id)
            if project is None:
                return None
            project["files"] = await _fetch_project_files(connection, project_id)
            project["links"] = await _fetch_project_links(connection, project_id)
            project["prints"] = await _fetch_project_prints(connection, project_id)
            return project

    async def create_project(self, name: str) -> dict[str, Any]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            cursor = await connection.execute(
                "INSERT INTO projects (name, notes, created_at) VALUES (?, NULL, ?)",
                (name, int(time.time())),
            )
            await connection.commit()
            async with connection.execute("SELECT * FROM projects WHERE id = ?", (cursor.lastrowid,)) as lookup_cursor:
                fetched = await lookup_cursor.fetchone()
                assert fetched is not None
                row = dict(fetched)
        row.update(
            {
                "print_count": 0,
                "total_duration_s": None,
                "total_cost": None,
                "total_filament_g": None,
                "files": [],
                "links": [],
                "prints": [],
                "cover_url": None,
                "cover_link_id": None,
            }
        )
        return row

    async def update_project(self, project_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
        async with self.open_connection() as connection:
            assignments = ", ".join(f"{column} = :{column}" for column in data)
            await connection.execute(
                f"UPDATE projects SET {assignments} WHERE id = :_id",
                {**data, "_id": project_id},
            )
            await connection.commit()
        return await self.get_project(project_id)

    async def delete_project(self, project_id: int) -> None:
        async with self.open_connection() as connection:
            await connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            await connection.commit()

    async def add_project_file(
        self, project_id: int, file_type: str, filename: str, label: str | None
    ) -> dict[str, Any]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            cursor = await connection.execute(
                "INSERT INTO project_files (project_id, type, filename, label) VALUES (?, ?, ?, ?)",
                (project_id, file_type, filename, label),
            )
            await connection.commit()
            async with connection.execute(
                "SELECT * FROM project_files WHERE id = ?", (cursor.lastrowid,)
            ) as lookup_cursor:
                row = await lookup_cursor.fetchone()
                assert row is not None
                return dict(row)

    async def get_project_file(self, file_id: int) -> dict[str, Any] | None:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute("SELECT * FROM project_files WHERE id = ?", (file_id,)) as lookup_cursor:
                row = await lookup_cursor.fetchone()
                return dict(row) if row else None

    async def delete_project_file(self, file_id: int) -> None:
        async with self.open_connection() as connection:
            await connection.execute("DELETE FROM project_files WHERE id = ?", (file_id,))
            await connection.commit()

    async def add_project_link(self, project_id: int, url: str, label: str | None) -> dict[str, Any]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            cursor = await connection.execute(
                "INSERT INTO project_links (project_id, url, label) VALUES (?, ?, ?)",
                (project_id, url, label),
            )
            await connection.commit()
            async with connection.execute(
                "SELECT * FROM project_links WHERE id = ?", (cursor.lastrowid,)
            ) as lookup_cursor:
                row = await lookup_cursor.fetchone()
                assert row is not None
                return dict(row)

    async def delete_project_link(self, link_id: int) -> None:
        async with self.open_connection() as connection:
            await connection.execute("DELETE FROM project_links WHERE id = ?", (link_id,))
            await connection.commit()

    async def list_unenriched_links(self) -> list[dict[str, Any]]:
        """Return all project links that have no enrichment metadata yet."""
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute("SELECT * FROM project_links WHERE meta IS NULL ORDER BY id") as cursor:
                return [dict(row) for row in await cursor.fetchall()]

    async def set_link_meta(self, link_id: int, meta_json: str) -> None:
        async with self.open_connection() as connection:
            await connection.execute("UPDATE project_links SET meta = ? WHERE id = ?", (meta_json, link_id))
            await connection.commit()

    async def set_project_cover(self, project_id: int, cover_url: str | None, cover_link_id: int | None) -> None:
        async with self.open_connection() as connection:
            await connection.execute(
                "UPDATE projects SET cover_url = ?, cover_link_id = ? WHERE id = ?",
                (cover_url, cover_link_id, project_id),
            )
            await connection.commit()

    async def add_project_print(
        self,
        project_id: int,
        project_file_id: int | None,
        job_id: str,
        duration_s: float | None,
        filament_g: float | None,
        cost_total: float | None,
    ) -> dict[str, Any]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            await connection.execute(
                """INSERT INTO project_prints
                   (project_id, project_file_id, job_id, duration_s, filament_g, cost_total)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(project_id, job_id) DO UPDATE SET
                       duration_s = excluded.duration_s,
                       filament_g = excluded.filament_g,
                       cost_total = excluded.cost_total""",
                (project_id, project_file_id, job_id, duration_s, filament_g, cost_total),
            )
            await connection.commit()
            async with connection.execute(
                "SELECT * FROM project_prints WHERE project_id = ? AND job_id = ?",
                (project_id, job_id),
            ) as lookup_cursor:
                row = await lookup_cursor.fetchone()
                assert row is not None
                return dict(row)

    async def delete_project_print(self, project_id: int, job_id: str) -> None:
        async with self.open_connection() as connection:
            await connection.execute(
                "DELETE FROM project_prints WHERE project_id = ? AND job_id = ?",
                (project_id, job_id),
            )
            await connection.commit()

    async def refresh_project_prints_stats(
        self, job_id: str, duration_s: float | None, filament_g: float | None, cost_total: float | None
    ) -> None:
        """Update cached duration/filament/cost for all project_prints rows with this job_id.

        Called by the recorder after every InfluxDB write so project stats stay in sync automatically.
        """
        async with self.open_connection() as connection:
            await connection.execute(
                """UPDATE project_prints
                   SET duration_s = ?, filament_g = ?, cost_total = ?
                   WHERE job_id = ?""",
                (duration_s, filament_g, cost_total, job_id),
            )
            await connection.commit()

    async def get_project_for_job(self, job_id: str) -> dict[str, Any] | None:
        """Return the first project linked to a job_id, or None."""
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute(
                """SELECT pp.project_id AS id, p.name
                   FROM project_prints pp
                   JOIN projects p ON p.id = pp.project_id
                   WHERE pp.job_id = ?
                   LIMIT 1""",
                (job_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def get_or_create_print_job(self, job_id: str) -> dict[str, Any]:
        """Return existing print_jobs row, creating it if necessary."""
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            await connection.execute(
                "INSERT OR IGNORE INTO print_jobs (job_id, created_at) VALUES (?, ?)",
                (job_id, int(time.time())),
            )
            await connection.commit()
            async with connection.execute("SELECT * FROM print_jobs WHERE job_id = ?", (job_id,)) as cursor:
                row = await cursor.fetchone()
                assert row is not None
                result = dict(row)
        # Deserialize JSON-stored fields
        for field, default in (("settings", None), ("gcode_meta", None)):
            raw = result.get(field)
            if raw is not None:
                try:
                    result[field] = json.loads(raw)
                except Exception:
                    result[field] = default
            else:
                result[field] = default
        return result

    async def update_print_job(self, job_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """Update allowed fields on a print_jobs row and return the updated row."""
        allowed = {column: value for column, value in data.items() if column in ("notes", "settings", "gcode_meta")}
        if allowed:
            assignments = ", ".join(f"{column} = :{column}" for column in allowed)
            async with self.open_connection() as connection:
                await connection.execute(
                    f"UPDATE print_jobs SET {assignments} WHERE job_id = :_id",
                    {**allowed, "_id": job_id},
                )
                await connection.commit()
        return await self.get_or_create_print_job(job_id)

    async def add_print_photo(self, job_id: str, filename: str, source: str) -> dict[str, Any]:
        """Insert a photo record and return it."""
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            cursor = await connection.execute(
                "INSERT INTO print_photos (job_id, filename, source, captured_at) VALUES (?, ?, ?, ?)",
                (job_id, filename, source, int(time.time())),
            )
            await connection.commit()
            async with connection.execute(
                "SELECT * FROM print_photos WHERE id = ?", (cursor.lastrowid,)
            ) as lookup_cursor:
                row = await lookup_cursor.fetchone()
                assert row is not None
                return dict(row)

    async def list_print_photos(self, job_id: str) -> list[dict[str, Any]]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute(
                "SELECT * FROM print_photos WHERE job_id = ? ORDER BY captured_at",
                (job_id,),
            ) as cursor:
                return [dict(row) for row in await cursor.fetchall()]

    async def delete_print_photo(self, photo_id: int) -> None:
        async with self.open_connection() as connection:
            await connection.execute("DELETE FROM print_photos WHERE id = ?", (photo_id,))
            await connection.commit()

    async def set_print_end_time(self, job_id: str, end_time: int) -> None:
        async with self.open_connection() as connection:
            await connection.execute(
                "UPDATE print_jobs SET end_time = ? WHERE job_id = ? AND end_time IS NULL",
                (end_time, job_id),
            )
            await connection.commit()

    async def bulk_set_print_end_times(self, job_end_times: dict[str, int]) -> None:
        """Set end_time for many jobs at once (only fills nulls). Used by reconcile."""
        if not job_end_times:
            return
        async with self.open_connection() as connection:
            await connection.executemany(
                "UPDATE print_jobs SET end_time = ? WHERE job_id = ? AND end_time IS NULL",
                [(end_time, job_id) for job_id, end_time in job_end_times.items()],
            )
            await connection.commit()

    async def cleanup_stale_webcam_photos(self, grace_s: int = 3600) -> int:
        """Delete webcam photos captured > grace_s after their print ended.

        Only acts on jobs that have a known end_time. Returns total deleted count.
        """
        async with self.open_connection() as connection:
            cursor = await connection.execute(
                """
                DELETE FROM print_photos
                WHERE source = 'webcam'
                  AND id IN (
                    SELECT pp.id FROM print_photos pp
                    JOIN print_jobs pj ON pj.job_id = pp.job_id
                    WHERE pj.end_time IS NOT NULL
                      AND pp.captured_at > pj.end_time + ?
                  )
                """,
                (grace_s,),
            )
            await connection.commit()
            return cursor.rowcount or 0

    async def delete_stale_webcam_photos(self, job_id: str, print_end_time: int, grace_s: int = 3600) -> int:
        """Delete webcam photos captured more than grace_s after the print ended.

        Returns count of deleted rows. Used to clean up snapshots taken during reconcile backfill.
        """
        cutoff = print_end_time + grace_s
        async with self.open_connection() as connection:
            cursor = await connection.execute(
                "DELETE FROM print_photos WHERE job_id = ? AND source = 'webcam' AND captured_at > ?",
                (job_id, cutoff),
            )
            await connection.commit()
            return cursor.rowcount or 0

    async def add_push_subscription(self, endpoint: str, p256dh: str, auth: str) -> None:
        async with self.open_connection() as connection:
            await connection.execute(
                """INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth""",
                (endpoint, p256dh, auth, int(time.time())),
            )
            await connection.commit()

    async def get_push_subscriptions(self) -> list[dict[str, Any]]:
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute("SELECT * FROM push_subscriptions") as cursor:
                return [dict(row) for row in await cursor.fetchall()]

    async def remove_push_subscription(self, endpoint: str) -> None:
        async with self.open_connection() as connection:
            await connection.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
            await connection.commit()

    async def get_print_detail_counts(self, job_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Return has_detail and photo_count for each job_id in a single batch query."""
        if not job_ids:
            return {}
        placeholders = ",".join("?" * len(job_ids))
        result: dict[str, dict[str, Any]] = {job_id: {"has_detail": False, "photo_count": 0} for job_id in job_ids}
        async with self.open_connection() as connection:
            connection.row_factory = aiosqlite.Row
            async with connection.execute(
                f"SELECT job_id FROM print_jobs WHERE job_id IN ({placeholders})",
                job_ids,
            ) as cursor:
                for row in await cursor.fetchall():
                    result[row["job_id"]]["has_detail"] = True
            async with connection.execute(
                f"SELECT job_id, COUNT(*) AS photo_count FROM print_photos WHERE job_id IN ({placeholders}) GROUP BY job_id",
                job_ids,
            ) as cursor:
                for row in await cursor.fetchall():
                    result[row["job_id"]]["photo_count"] = row["photo_count"]
        return result


default_database = Database()


async def init_db(path: str, connect: Callable[..., aiosqlite.Connection] = aiosqlite.connect) -> None:
    """Creates and migrates the database at `path` (with `connect`) and makes it the one of the default database."""
    default_database.path = path
    await Database(path, connect).initialise()


def __getattr__(name: str) -> Any:
    """The functions of the default database stay available as `db.<function>`, for the callers that use the module."""
    return getattr(default_database, name)
