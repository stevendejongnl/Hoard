import hashlib
import io

import numpy as np
from PIL import Image
from stl.mesh import Mesh

from app.thumbnail import render_stl_thumbnail, render_stl_thumbnails


def build_pyramid_stl() -> bytes:
    apex = [0.0, 0.0, 10.0]
    corners = [[-5.0, -5.0, 0.0], [5.0, -5.0, 0.0], [5.0, 5.0, 0.0], [-5.0, 5.0, 0.0]]
    triangles = [[corners[index], corners[(index + 1) % 4], apex] for index in range(4)]
    triangles.append([corners[0], corners[2], corners[1]])
    triangles.append([corners[0], corners[3], corners[2]])
    mesh = Mesh(np.zeros(len(triangles), dtype=Mesh.dtype))
    mesh.vectors[:] = np.array(triangles)
    buffer = io.BytesIO()
    mesh.save("pyramid", fh=buffer)
    return buffer.getvalue()


def pixel_digest(png: bytes) -> str:
    return hashlib.sha256(Image.open(io.BytesIO(png)).convert("RGB").tobytes()).hexdigest()


def test_stl_thumbnail_is_a_png_of_the_requested_size():
    image = Image.open(io.BytesIO(render_stl_thumbnail(build_pyramid_stl(), size=100)))
    assert image.format == "PNG"
    assert image.size == (100, 100)


def test_stl_thumbnail_pixels_stay_identical():
    assert (
        pixel_digest(render_stl_thumbnail(build_pyramid_stl(), size=150))
        == "7baa3bf2710d31f3ee481bcc215d605e145bac333d1ff57008f02c708a71e0a0"
    )


def test_stl_thumbnails_give_a_small_and_a_large_cura_image():
    thumbnails = render_stl_thumbnails(build_pyramid_stl())
    assert [(width, height) for width, height, _ in thumbnails] == [(32, 32), (300, 300)]
    assert Image.open(io.BytesIO(thumbnails[0][2])).size == (32, 32)
    assert Image.open(io.BytesIO(thumbnails[1][2])).size == (300, 300)
    assert pixel_digest(thumbnails[1][2]) == "7e5675c8175f456a097a731aa0d8a9809b32e2433e951434f073cccdea181478"
