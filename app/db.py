import time
from typing import Any

import aiosqlite

_db_path: str = ""


async def init_db(path: str) -> None:
    global _db_path
    _db_path = path
    async with aiosqlite.connect(path) as db:
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


def _conn() -> aiosqlite.Connection:
    conn = aiosqlite.connect(_db_path)
    return conn


async def get_active_spool() -> dict[str, Any] | None:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM spools WHERE active = 1 LIMIT 1"
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def list_spools() -> list[dict[str, Any]]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM spools ORDER BY active DESC, created_at DESC"
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def create_spool(data: dict[str, Any]) -> dict[str, Any]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """INSERT INTO spools
               (brand, material, color, color_hex, cost_per_gram,
                initial_weight_g, current_weight_g, notes, active, created_at)
               VALUES (:brand, :material, :color, :color_hex, :cost_per_gram,
                       :initial_weight_g, :current_weight_g, :notes, :active, :created_at)""",
            {**data, "active": data.get("active", 0), "created_at": int(time.time())},
        )
        await db.commit()
        async with db.execute("SELECT * FROM spools WHERE id = ?", (cur.lastrowid,)) as c:
            return dict(await c.fetchone())


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
        async with db.execute(
            "SELECT 1 FROM print_spools WHERE spool_id = ? LIMIT 1", (spool_id,)
        ) as cur:
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
                      SUM(pp.filament_g)           AS total_filament_g
               FROM projects p
               LEFT JOIN project_prints pp ON pp.project_id = p.id
               GROUP BY p.id
               ORDER BY p.created_at DESC"""
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
                f.update(dict(await cur.fetchone()))

        async with db.execute(
            "SELECT * FROM project_links WHERE project_id = ? ORDER BY id",
            (project_id,),
        ) as cur:
            links = [dict(r) for r in await cur.fetchall()]

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
            row = dict(await c.fetchone())
    row.update({
        "print_count": 0, "total_duration_s": None,
        "total_cost": None, "total_filament_g": None,
        "files": [], "links": [], "prints": [],
        "cover_url": None, "cover_link_id": None,
    })
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


async def add_project_file(
    project_id: int, file_type: str, filename: str, label: str | None
) -> dict[str, Any]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO project_files (project_id, type, filename, label) VALUES (?, ?, ?, ?)",
            (project_id, file_type, filename, label),
        )
        await db.commit()
        async with db.execute("SELECT * FROM project_files WHERE id = ?", (cur.lastrowid,)) as c:
            return dict(await c.fetchone())


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


async def add_project_link(
    project_id: int, url: str, label: str | None
) -> dict[str, Any]:
    async with _conn() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO project_links (project_id, url, label) VALUES (?, ?, ?)",
            (project_id, url, label),
        )
        await db.commit()
        async with db.execute("SELECT * FROM project_links WHERE id = ?", (cur.lastrowid,)) as c:
            return dict(await c.fetchone())


async def delete_project_link(link_id: int) -> None:
    async with _conn() as db:
        await db.execute("DELETE FROM project_links WHERE id = ?", (link_id,))
        await db.commit()


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
            """INSERT OR IGNORE INTO project_prints
               (project_id, project_file_id, job_id, duration_s, filament_g, cost_total)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (project_id, project_file_id, job_id, duration_s, filament_g, cost_total),
        )
        await db.commit()
        async with db.execute(
            "SELECT * FROM project_prints WHERE project_id = ? AND job_id = ?",
            (project_id, job_id),
        ) as c:
            return dict(await c.fetchone())


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
