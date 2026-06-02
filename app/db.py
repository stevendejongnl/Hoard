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
