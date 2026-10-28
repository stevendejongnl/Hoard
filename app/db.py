import json as _json
import time
from typing import Any

import aiosqlite

_db_path: str = ""


async def init_db(path: str) -> None:
    global _db_path
    _db_path = path
    async with aiosqlite.connect(path) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA busy_timeout=5000")
        await db.execute("""
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
        async with db.execute("PRAGMA table_info(spools)") as cur:
            spool_columns = [row[1] for row in await cur.fetchall()]
        if "tag_id" not in spool_columns:
            await db.execute("ALTER TABLE spools ADD COLUMN tag_id TEXT")
        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_spools_tag_id ON spools(tag_id)")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS print_spools (
                job_id          TEXT PRIMARY KEY,
                spool_id        INTEGER REFERENCES spools(id),
                filament_used_g REAL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL,
                notes      TEXT,
                created_at INTEGER NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS project_files (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                type       TEXT    NOT NULL CHECK(type IN ('gcode', 'stl')),
                filename   TEXT    NOT NULL,
                label      TEXT
            )
        """)
        # Migrate project_files to drop the CHECK constraint so any file extension is allowed
        async with db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='project_files'") as cur:
            row = await cur.fetchone()
            if row and "CHECK" in (row[0] or ""):
                await db.execute("""
                    CREATE TABLE project_files_new (
                        id         INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                        type       TEXT    NOT NULL,
                        filename   TEXT    NOT NULL,
                        label      TEXT
                    )
                """)
                await db.execute("INSERT INTO project_files_new SELECT * FROM project_files")
                await db.execute("DROP TABLE project_files")
                await db.execute("ALTER TABLE project_files_new RENAME TO project_files")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS project_links (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                url        TEXT    NOT NULL,
                label      TEXT
            )
        """)
        # Enrichment columns — safe to run repeatedly via IF NOT EXISTS alternative
        for col, typedef in [
            ("meta", "TEXT"),
        ]:
            try:
                await db.execute(f"ALTER TABLE project_links ADD COLUMN {col} {typedef}")
            except Exception:
                pass  # column already exists

        for col, typedef in [
            ("cover_url", "TEXT"),
            ("cover_link_id", "INTEGER"),
        ]:
            try:
                await db.execute(f"ALTER TABLE projects ADD COLUMN {col} {typedef}")
            except Exception:
                pass
        await db.commit()
        await db.execute("""
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
        await db.commit()

        await db.execute("""
            CREATE TABLE IF NOT EXISTS print_jobs (
                job_id      TEXT PRIMARY KEY,
                notes       TEXT,
                settings    TEXT,
                created_at  INTEGER NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS print_photos (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id      TEXT    NOT NULL,
                filename    TEXT    NOT NULL,
                source      TEXT    NOT NULL,
                captured_at INTEGER NOT NULL
            )
        """)
        await db.commit()
        # gcode_meta column — stores slicer-extracted metadata as JSON
        try:
            await db.execute("ALTER TABLE print_jobs ADD COLUMN gcode_meta TEXT")
        except Exception:
            pass  # column already exists
        # drop tags column (no longer used)
        try:
            await db.execute("ALTER TABLE print_jobs DROP COLUMN tags")
        except Exception:
            pass  # column already dropped or never existed
        # end_time column — unix timestamp when the print completed
        try:
            await db.execute("ALTER TABLE print_jobs ADD COLUMN end_time INTEGER")
        except Exception:
            pass  # column already exists
        await db.commit()

        await db.execute("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                endpoint   TEXT PRIMARY KEY,
                p256dh     TEXT NOT NULL,
                auth       TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        await db.commit()

        # Indexes — idempotent, safe to run on every startup
        await db.execute("CREATE INDEX IF NOT EXISTS idx_print_photos_job_id ON print_photos(job_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_project_prints_job_id ON project_prints(job_id)")
        await db.commit()


def _conn() -> aiosqlite.Connection:
    return aiosqlite.connect(_db_path, timeout=5)


async def get_active_spool() -> dict[str, Any] | None:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM spools WHERE active = 1 LIMIT 1") as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def list_spools() -> list[dict[str, Any]]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM spools ORDER BY active DESC, created_at DESC") as cur:
            return [dict(r) for r in await cur.fetchall()]


async def create_spool(data: dict[str, Any]) -> dict[str, Any]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """INSERT INTO spools
               (brand, material, color, color_hex, cost_per_gram,
                initial_weight_g, current_weight_g, notes, active, tag_id, created_at)
               VALUES (:brand, :material, :color, :color_hex, :cost_per_gram,
                       :initial_weight_g, :current_weight_g, :notes, :active, :tag_id, :created_at)""",
            {**data, "active": data.get("active", 0), "tag_id": data.get("tag_id"), "created_at": int(time.time())},
        )
        await db.commit()
        async with db.execute("SELECT * FROM spools WHERE id = ?", (cur.lastrowid,)) as c:
            row = await c.fetchone()
            assert row is not None
            return dict(row)


async def find_spool_by_tag(tag_id: str) -> dict[str, Any] | None:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM spools WHERE tag_id = ?", (tag_id,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def update_spool(spool_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        if data.get("active"):
            await db.execute("UPDATE spools SET active = 0")
        sets = ", ".join(f"{k} = :{k}" for k in data)
        await db.execute(
            f"UPDATE spools SET {sets} WHERE id = :_id",
            {**data, "_id": spool_id},
        )
        await db.commit()
        async with db.execute("SELECT * FROM spools WHERE id = ?", (spool_id,)) as c:
            row = await c.fetchone()
            return dict(row) if row else None


async def delete_spool(spool_id: int) -> bool:
    async with _conn() as db:
        async with db.execute("SELECT 1 FROM print_spools WHERE spool_id = ? LIMIT 1", (spool_id,)) as cur:
            if await cur.fetchone():
                return False
        await db.execute("DELETE FROM spools WHERE id = ?", (spool_id,))
        await db.commit()
        return True


async def deduct_spool_weight(spool_id: int, grams: float) -> None:
    async with _conn() as db:
        await db.execute(
            "UPDATE spools SET current_weight_g = MAX(0, current_weight_g - ?) WHERE id = ?",
            (grams, spool_id),
        )
        await db.commit()


async def link_print_spool(job_id: str, spool_id: int | None, filament_used_g: float) -> None:
    async with _conn() as db:
        await db.execute(
            """INSERT INTO print_spools (job_id, spool_id, filament_used_g)
               VALUES (?, ?, ?)
               ON CONFLICT(job_id) DO UPDATE SET spool_id=excluded.spool_id,
               filament_used_g=excluded.filament_used_g""",
            (job_id, spool_id, filament_used_g),
        )
        await db.commit()


async def _list_all_print_spools() -> list[dict[str, Any]]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT job_id, spool_id, filament_used_g FROM print_spools") as cur:
            return [dict(r) for r in await cur.fetchall()]


async def get_print_spool(job_id: str) -> dict[str, Any] | None:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT ps.*, s.brand, s.material, s.color, s.color_hex, s.cost_per_gram
               FROM print_spools ps
               LEFT JOIN spools s ON s.id = ps.spool_id
               WHERE ps.job_id = ?""",
            (job_id,),
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def list_projects() -> list[dict[str, Any]]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
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
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def get_project(project_id: int) -> dict[str, Any] | None:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
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
        ) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            result = dict(row)

        async with db.execute(
            "SELECT * FROM project_files WHERE project_id = ? ORDER BY id",
            (project_id,),
        ) as cur:
            files = [dict(r) for r in await cur.fetchall()]

        for f in files:
            async with db.execute(
                """SELECT COALESCE(COUNT(id), 0) AS print_count,
                          SUM(duration_s)         AS total_duration_s,
                          SUM(cost_total)          AS total_cost,
                          SUM(filament_g)          AS total_filament_g
                   FROM project_prints WHERE project_file_id = ?""",
                (f["id"],),
            ) as cur:
                stats = await cur.fetchone()
                if stats is not None:
                    f.update(dict(stats))

        async with db.execute(
            "SELECT * FROM project_links WHERE project_id = ? ORDER BY id",
            (project_id,),
        ) as cur:
            links = []
            for row in await cur.fetchall():
                link = dict(row)
                if link.get("meta"):
                    try:
                        link["meta"] = _json.loads(link["meta"])
                    except Exception:
                        link["meta"] = None
                links.append(link)

        async with db.execute(
            "SELECT * FROM project_prints WHERE project_id = ? ORDER BY id",
            (project_id,),
        ) as cur:
            prints = [dict(r) for r in await cur.fetchall()]

        result["files"] = files
        result["links"] = links
        result["prints"] = prints
        return result


async def create_project(name: str) -> dict[str, Any]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO projects (name, notes, created_at) VALUES (?, NULL, ?)",
            (name, int(time.time())),
        )
        await db.commit()
        async with db.execute("SELECT * FROM projects WHERE id = ?", (cur.lastrowid,)) as c:
            fetched = await c.fetchone()
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


async def update_project(project_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
    async with _conn() as db:
        sets = ", ".join(f"{k} = :{k}" for k in data)
        await db.execute(
            f"UPDATE projects SET {sets} WHERE id = :_id",
            {**data, "_id": project_id},
        )
        await db.commit()
    return await get_project(project_id)


async def delete_project(project_id: int) -> None:
    async with _conn() as db:
        await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        await db.commit()


async def add_project_file(project_id: int, file_type: str, filename: str, label: str | None) -> dict[str, Any]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO project_files (project_id, type, filename, label) VALUES (?, ?, ?, ?)",
            (project_id, file_type, filename, label),
        )
        await db.commit()
        async with db.execute("SELECT * FROM project_files WHERE id = ?", (cur.lastrowid,)) as c:
            row = await c.fetchone()
            assert row is not None
            return dict(row)


async def get_project_file(file_id: int) -> dict[str, Any] | None:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM project_files WHERE id = ?", (file_id,)) as c:
            row = await c.fetchone()
            return dict(row) if row else None


async def delete_project_file(file_id: int) -> None:
    async with _conn() as db:
        await db.execute("DELETE FROM project_files WHERE id = ?", (file_id,))
        await db.commit()


async def add_project_link(project_id: int, url: str, label: str | None) -> dict[str, Any]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO project_links (project_id, url, label) VALUES (?, ?, ?)",
            (project_id, url, label),
        )
        await db.commit()
        async with db.execute("SELECT * FROM project_links WHERE id = ?", (cur.lastrowid,)) as c:
            row = await c.fetchone()
            assert row is not None
            return dict(row)


async def delete_project_link(link_id: int) -> None:
    async with _conn() as db:
        await db.execute("DELETE FROM project_links WHERE id = ?", (link_id,))
        await db.commit()


async def list_unenriched_links() -> list[dict[str, Any]]:
    """Return all project links that have no enrichment metadata yet."""
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM project_links WHERE meta IS NULL ORDER BY id") as cur:
            return [dict(r) for r in await cur.fetchall()]


async def set_link_meta(link_id: int, meta_json: str) -> None:
    async with _conn() as db:
        await db.execute("UPDATE project_links SET meta = ? WHERE id = ?", (meta_json, link_id))
        await db.commit()


async def set_project_cover(project_id: int, cover_url: str | None, cover_link_id: int | None) -> None:
    async with _conn() as db:
        await db.execute(
            "UPDATE projects SET cover_url = ?, cover_link_id = ? WHERE id = ?",
            (cover_url, cover_link_id, project_id),
        )
        await db.commit()


async def add_project_print(
    project_id: int,
    project_file_id: int | None,
    job_id: str,
    duration_s: float | None,
    filament_g: float | None,
    cost_total: float | None,
) -> dict[str, Any]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            """INSERT INTO project_prints
               (project_id, project_file_id, job_id, duration_s, filament_g, cost_total)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(project_id, job_id) DO UPDATE SET
                   duration_s = excluded.duration_s,
                   filament_g = excluded.filament_g,
                   cost_total = excluded.cost_total""",
            (project_id, project_file_id, job_id, duration_s, filament_g, cost_total),
        )
        await db.commit()
        async with db.execute(
            "SELECT * FROM project_prints WHERE project_id = ? AND job_id = ?",
            (project_id, job_id),
        ) as c:
            row = await c.fetchone()
            assert row is not None
            return dict(row)


async def delete_project_print(project_id: int, job_id: str) -> None:
    async with _conn() as db:
        await db.execute(
            "DELETE FROM project_prints WHERE project_id = ? AND job_id = ?",
            (project_id, job_id),
        )
        await db.commit()


async def refresh_project_prints_stats(
    job_id: str, duration_s: float | None, filament_g: float | None, cost_total: float | None
) -> None:
    """Update cached duration/filament/cost for all project_prints rows with this job_id.

    Called by the recorder after every InfluxDB write so project stats stay in sync automatically.
    """
    async with _conn() as db:
        await db.execute(
            """UPDATE project_prints
               SET duration_s = ?, filament_g = ?, cost_total = ?
               WHERE job_id = ?""",
            (duration_s, filament_g, cost_total, job_id),
        )
        await db.commit()


async def get_project_for_job(job_id: str) -> dict[str, Any] | None:
    """Return the first project linked to a job_id, or None."""
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT pp.project_id AS id, p.name
               FROM project_prints pp
               JOIN projects p ON p.id = pp.project_id
               WHERE pp.job_id = ?
               LIMIT 1""",
            (job_id,),
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def get_or_create_print_job(job_id: str) -> dict[str, Any]:
    """Return existing print_jobs row, creating it if necessary."""
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            "INSERT OR IGNORE INTO print_jobs (job_id, created_at) VALUES (?, ?)",
            (job_id, int(time.time())),
        )
        await db.commit()
        async with db.execute("SELECT * FROM print_jobs WHERE job_id = ?", (job_id,)) as cur:
            row = await cur.fetchone()
            assert row is not None
            result = dict(row)
    # Deserialize JSON-stored fields
    for field, default in (("settings", None), ("gcode_meta", None)):
        raw = result.get(field)
        if raw is not None:
            try:
                result[field] = _json.loads(raw)
            except Exception:
                result[field] = default
        else:
            result[field] = default
    return result


async def update_print_job(job_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update allowed fields on a print_jobs row and return the updated row."""
    allowed = {k: v for k, v in data.items() if k in ("notes", "settings", "gcode_meta")}
    if allowed:
        sets = ", ".join(f"{k} = :{k}" for k in allowed)
        async with _conn() as db:
            await db.execute(
                f"UPDATE print_jobs SET {sets} WHERE job_id = :_id",
                {**allowed, "_id": job_id},
            )
            await db.commit()
    return await get_or_create_print_job(job_id)


async def add_print_photo(job_id: str, filename: str, source: str) -> dict[str, Any]:
    """Insert a photo record and return it."""
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO print_photos (job_id, filename, source, captured_at) VALUES (?, ?, ?, ?)",
            (job_id, filename, source, int(time.time())),
        )
        await db.commit()
        async with db.execute("SELECT * FROM print_photos WHERE id = ?", (cur.lastrowid,)) as c:
            row = await c.fetchone()
            assert row is not None
            return dict(row)


async def list_print_photos(job_id: str) -> list[dict[str, Any]]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM print_photos WHERE job_id = ? ORDER BY captured_at",
            (job_id,),
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def delete_print_photo(photo_id: int) -> None:
    async with _conn() as db:
        await db.execute("DELETE FROM print_photos WHERE id = ?", (photo_id,))
        await db.commit()


async def set_print_end_time(job_id: str, end_time: int) -> None:
    async with _conn() as db:
        await db.execute(
            "UPDATE print_jobs SET end_time = ? WHERE job_id = ? AND end_time IS NULL",
            (end_time, job_id),
        )
        await db.commit()


async def bulk_set_print_end_times(job_end_times: dict[str, int]) -> None:
    """Set end_time for many jobs at once (only fills nulls). Used by reconcile."""
    if not job_end_times:
        return
    async with _conn() as db:
        await db.executemany(
            "UPDATE print_jobs SET end_time = ? WHERE job_id = ? AND end_time IS NULL",
            [(et, jid) for jid, et in job_end_times.items()],
        )
        await db.commit()


async def cleanup_stale_webcam_photos(grace_s: int = 3600) -> int:
    """Delete webcam photos captured > grace_s after their print ended.

    Only acts on jobs that have a known end_time. Returns total deleted count.
    """
    async with _conn() as db:
        cur = await db.execute(
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
        await db.commit()
        return cur.rowcount or 0


async def delete_stale_webcam_photos(job_id: str, print_end_time: int, grace_s: int = 3600) -> int:
    """Delete webcam photos captured more than grace_s after the print ended.

    Returns count of deleted rows. Used to clean up snapshots taken during reconcile backfill.
    """
    cutoff = print_end_time + grace_s
    async with _conn() as db:
        cur = await db.execute(
            "DELETE FROM print_photos WHERE job_id = ? AND source = 'webcam' AND captured_at > ?",
            (job_id, cutoff),
        )
        await db.commit()
        return cur.rowcount or 0


async def add_push_subscription(endpoint: str, p256dh: str, auth: str) -> None:
    async with _conn() as db:
        await db.execute(
            """INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth""",
            (endpoint, p256dh, auth, int(time.time())),
        )
        await db.commit()


async def get_push_subscriptions() -> list[dict[str, Any]]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM push_subscriptions") as cur:
            return [dict(r) for r in await cur.fetchall()]


async def remove_push_subscription(endpoint: str) -> None:
    async with _conn() as db:
        await db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        await db.commit()


async def get_print_detail_counts(job_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Return has_detail and photo_count for each job_id in a single batch query."""
    if not job_ids:
        return {}
    placeholders = ",".join("?" * len(job_ids))
    result: dict[str, dict[str, Any]] = {jid: {"has_detail": False, "photo_count": 0} for jid in job_ids}
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            f"SELECT job_id FROM print_jobs WHERE job_id IN ({placeholders})",
            job_ids,
        ) as cur:
            for row in await cur.fetchall():
                result[row["job_id"]]["has_detail"] = True
        async with db.execute(
            f"SELECT job_id, COUNT(*) AS cnt FROM print_photos WHERE job_id IN ({placeholders}) GROUP BY job_id",
            job_ids,
        ) as cur:
            for row in await cur.fetchall():
                result[row["job_id"]]["photo_count"] = row["cnt"]
    return result
