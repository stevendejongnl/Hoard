import io

import numpy as np
from PIL import Image, ImageDraw


def _build_rotation() -> np.ndarray:
    yaw = np.radians(45)
    pitch = np.radians(35)
    cy, sy = np.cos(yaw), np.sin(yaw)
    cp, sp = np.cos(pitch), np.sin(pitch)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    return Rx @ Ry


_R = _build_rotation()
_LIGHT = np.array([0.4, 0.6, 1.0])
_LIGHT /= np.linalg.norm(_LIGHT)
_BASE_COLOR = np.array([34.0, 211.0, 238.0])  # cyan #22d3ee
_BG = (20, 20, 20)


def render_stl_thumbnail(stl_bytes: bytes, size: int = 300) -> bytes:
    from stl.mesh import Mesh

    mesh = Mesh.from_file("", fh=io.BytesIO(stl_bytes))
    verts = mesh.vectors  # (N, 3, 3)

    center = verts.reshape(-1, 3).mean(axis=0)
    v_centered = (verts - center).reshape(-1, 3) @ _R.T  # (N*3, 3)
    v_rot = v_centered.reshape(-1, 3, 3)                  # (N, 3, 3)

    # Orthographic: X→right, Y→up, Z→depth
    proj2d = v_rot[..., :2]          # (N, 3, 2)
    depth = v_rot[..., 2].mean(1)   # (N,)

    # Face normals for diffuse lighting
    e1 = verts[:, 1] - verts[:, 0]
    e2 = verts[:, 2] - verts[:, 0]
    normals = np.cross(e1, e2).astype(float)
    nlen = np.linalg.norm(normals, axis=1, keepdims=True)
    normals /= np.where(nlen < 1e-10, 1.0, nlen)
    n_rot = normals @ _R.T
    brightness = np.clip(n_rot @ _LIGHT, 0.0, 1.0)

    # Scale to canvas
    margin = max(4, size // 16)
    all_pts = proj2d.reshape(-1, 2)
    lo, hi = all_pts.min(0), all_pts.max(0)
    rng = max((hi - lo).max(), 1e-6)
    canvas = size - 2 * margin
    scale = canvas / rng
    ox = margin + (canvas - (hi[0] - lo[0]) * scale) / 2
    oy = margin + (canvas - (hi[1] - lo[1]) * scale) / 2

    order = np.argsort(depth)  # back to front

    img = Image.new("RGB", (size, size), _BG)
    draw = ImageDraw.Draw(img)

    for idx in order:
        b = 0.15 + 0.85 * float(brightness[idx])
        c = tuple(np.clip(_BASE_COLOR * b, 0, 255).astype(int))
        tri = [
            (
                int((proj2d[idx, j, 0] - lo[0]) * scale + ox),
                int(size - ((proj2d[idx, j, 1] - lo[1]) * scale + oy)),
            )
            for j in range(3)
        ]
        draw.polygon(tri, fill=c)

    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    buf.seek(0)
    return buf.read()


def render_stl_thumbnails(stl_bytes: bytes) -> list[tuple[int, int, bytes]]:
    """Returns [(32,32,png), (300,300,png)] for Cura-format embedding."""
    png_large = render_stl_thumbnail(stl_bytes, 300)

    img = Image.open(io.BytesIO(png_large))
    img_small = img.resize((32, 32), Image.Resampling.LANCZOS)
    buf_small = io.BytesIO()
    img_small.save(buf_small, "PNG")

    return [(32, 32, buf_small.getvalue()), (300, 300, png_large)]
