import asyncio
import io

import numpy as np
from PIL import Image, ImageDraw
from stl.mesh import Mesh


def _build_rotation() -> np.ndarray:
    yaw = np.radians(45)
    pitch = np.radians(35)
    cos_yaw, sin_yaw = np.cos(yaw), np.sin(yaw)
    cos_pitch, sin_pitch = np.cos(pitch), np.sin(pitch)
    yaw_rotation = np.array([[cos_yaw, 0, sin_yaw], [0, 1, 0], [-sin_yaw, 0, cos_yaw]])
    pitch_rotation = np.array([[1, 0, 0], [0, cos_pitch, -sin_pitch], [0, sin_pitch, cos_pitch]])
    return pitch_rotation @ yaw_rotation


_ROTATION = _build_rotation()
_LIGHT = np.array([0.4, 0.6, 1.0])
_LIGHT /= np.linalg.norm(_LIGHT)
_BASE_COLOR = np.array([34.0, 211.0, 238.0])  # cyan #22d3ee
_BACKGROUND = (20, 20, 20)


def _face_brightness(vertices: np.ndarray) -> np.ndarray:
    """Diffuse lighting from the face normals, rotated into the view."""
    first_edge = vertices[:, 1] - vertices[:, 0]
    second_edge = vertices[:, 2] - vertices[:, 0]
    normals = np.cross(first_edge, second_edge).astype(float)
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    normals /= np.where(lengths < 1e-10, 1.0, lengths)
    return np.clip((normals @ _ROTATION.T) @ _LIGHT, 0.0, 1.0)


def _rotate_into_view(vertices: np.ndarray) -> np.ndarray:
    center = vertices.reshape(-1, 3).mean(axis=0)
    centered = (vertices - center).reshape(-1, 3) @ _ROTATION.T
    return centered.reshape(-1, 3, 3)


def _fit_to_canvas(projected: np.ndarray, size: int) -> tuple[np.ndarray, float, float, float]:
    """Return (lowest corner, scale, offset x, offset y) that centre the model on the canvas."""
    margin = max(4, size // 16)
    points = projected.reshape(-1, 2)
    low, high = points.min(0), points.max(0)
    extent = max((high - low).max(), 1e-6)
    canvas = size - 2 * margin
    scale = canvas / extent
    offset_x = margin + (canvas - (high[0] - low[0]) * scale) / 2
    offset_y = margin + (canvas - (high[1] - low[1]) * scale) / 2
    return low, scale, offset_x, offset_y


def render_stl_thumbnail(stl_bytes: bytes, size: int = 300) -> bytes:
    vertices = Mesh.from_file("", fh=io.BytesIO(stl_bytes)).vectors  # (N, 3, 3)
    rotated = _rotate_into_view(vertices)
    # Orthographic: X to the right, Y up, Z is the depth
    projected = rotated[..., :2]
    brightness = _face_brightness(vertices)
    low, scale, offset_x, offset_y = _fit_to_canvas(projected, size)

    image = Image.new("RGB", (size, size), _BACKGROUND)
    draw = ImageDraw.Draw(image)
    for index in np.argsort(rotated[..., 2].mean(1)):  # back to front
        shade = 0.15 + 0.85 * float(brightness[index])
        color = tuple(np.clip(_BASE_COLOR * shade, 0, 255).astype(int))
        triangle = [
            (
                int((projected[index, corner, 0] - low[0]) * scale + offset_x),
                int(size - ((projected[index, corner, 1] - low[1]) * scale + offset_y)),
            )
            for corner in range(3)
        ]
        draw.polygon(triangle, fill=color)

    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def render_stl_thumbnails(stl_bytes: bytes) -> list[tuple[int, int, bytes]]:
    """Returns [(32,32,png), (300,300,png)] for Cura-format embedding."""
    png_large = render_stl_thumbnail(stl_bytes, 300)

    large_image = Image.open(io.BytesIO(png_large))
    small_image = large_image.resize((32, 32), Image.Resampling.LANCZOS)
    small_buffer = io.BytesIO()
    small_image.save(small_buffer, "PNG")

    return [(32, 32, small_buffer.getvalue()), (300, 300, png_large)]


async def render_stl_thumbnails_in_worker(stl_bytes: bytes) -> list[tuple[int, int, bytes]]:
    """Renders on a worker thread: a big model takes seconds, and the event loop must stay free for other requests."""
    return await asyncio.to_thread(render_stl_thumbnails, stl_bytes)
