import hashlib
import io

from PIL import Image

from app.gcode_thumbnail import extract_thumbnail_png, inject_thumbnails, render_toolpath_thumbnail


def build_gcode(layer_count: int, moves_per_layer: int) -> bytes:
    lines = ["; header comment", "G28", "G1 X10 Y10 Z0.2 F3000 ; travel without extrusion"]
    for layer in range(layer_count):
        z = 0.2 * (layer + 1)
        for move in range(moves_per_layer):
            x = 20 + (move * 7) % 50 + layer
            y = 20 + (move * 11) % 40
            lines.append(f"G1 X{x} Y{y} Z{z:.2f} E{move * 0.1:.2f}")
        lines.append("G0 X200 Y200 ; far travel")
    lines.append("M84")
    return "\n".join(lines).encode("ascii")


def test_toolpath_thumbnail_is_none_with_fewer_than_twenty_extrusion_moves():
    assert render_toolpath_thumbnail(build_gcode(1, 19)) is None


def test_toolpath_thumbnail_is_none_for_empty_gcode():
    assert render_toolpath_thumbnail(b"") is None


def test_toolpath_thumbnail_ignores_moves_without_extrusion():
    travel_only = "\n".join(f"G0 X{n} Y{n} Z1" for n in range(100)).encode("ascii")
    assert render_toolpath_thumbnail(travel_only) is None


def test_toolpath_thumbnail_renders_a_square_png_of_the_requested_size():
    png = render_toolpath_thumbnail(build_gcode(5, 30), size=120)
    assert png is not None
    image = Image.open(io.BytesIO(png))
    assert image.format == "PNG"
    assert image.size == (120, 120)


def test_toolpath_thumbnail_pixels_stay_identical():
    png = render_toolpath_thumbnail(build_gcode(8, 60), size=200)
    assert png is not None
    pixels = Image.open(io.BytesIO(png)).convert("RGB").tobytes()
    assert hashlib.sha256(pixels).hexdigest() == "0e4e0809e6e7bb54ea8f4aa61e1ee24afe14ec47c5b0f35973e0f6752e233212"


def test_toolpath_thumbnail_with_many_points_is_thinned_and_stays_identical():
    png = render_toolpath_thumbnail(build_gcode(40, 300), size=300)
    assert png is not None
    pixels = Image.open(io.BytesIO(png)).convert("RGB").tobytes()
    assert hashlib.sha256(pixels).hexdigest() == "741ec23c8f16ddf948c5eed5392c53ebbd6429608069e825f89739185273c7be"


def test_inject_and_extract_round_trip():
    png = render_toolpath_thumbnail(build_gcode(5, 30), size=64)
    assert png is not None
    injected = inject_thumbnails(b"G28\n", [(32, 32, png), (300, 300, png)])
    assert injected.endswith(b"G28\n")
    assert extract_thumbnail_png(injected) == png
