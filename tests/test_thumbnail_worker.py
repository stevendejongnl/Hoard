import asyncio
import io
import time

import numpy as np
from stl import mesh

from app.thumbnail import render_stl_thumbnails, render_stl_thumbnails_in_worker

BIG_MODEL_TRIANGLES = 40_000
LONGEST_ALLOWED_PAUSE_SECONDS = 0.2


def create_stl(triangles: int) -> bytes:
    data = np.zeros(triangles, dtype=mesh.Mesh.dtype)
    data["vectors"] = np.random.default_rng(1).random((triangles, 3, 3)) * 100
    buffer = io.BytesIO()
    mesh.Mesh(data).save("model.stl", fh=buffer)
    return buffer.getvalue()


async def test_rendering_a_big_model_does_not_freeze_the_event_loop() -> None:
    stl_bytes = create_stl(BIG_MODEL_TRIANGLES)
    ticks: list[float] = []
    is_rendering = True

    async def tick() -> None:
        while is_rendering:
            ticks.append(time.monotonic())
            await asyncio.sleep(0.02)

    async def render() -> None:
        nonlocal is_rendering
        try:
            await render_stl_thumbnails_in_worker(stl_bytes)
        finally:
            is_rendering = False

    await asyncio.gather(render(), tick())
    longest_pause = max(later - earlier for earlier, later in zip(ticks, ticks[1:], strict=False))
    assert longest_pause < LONGEST_ALLOWED_PAUSE_SECONDS


async def test_the_worker_gives_the_same_thumbnails_as_rendering_directly() -> None:
    stl_bytes = create_stl(500)
    assert await render_stl_thumbnails_in_worker(stl_bytes) == render_stl_thumbnails(stl_bytes)
