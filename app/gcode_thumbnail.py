import base64
import io
import math
import re
from collections.abc import Callable

from PIL import Image, ImageDraw


def has_thumbnails(gcode_bytes: bytes) -> bool:
    return b"; thumbnail begin" in gcode_bytes[:8192]


def extract_thumbnail_png(gcode_bytes: bytes, prefer_size: int = 300) -> bytes | None:
    """Parse embedded thumbnail comments and return image bytes closest to prefer_size.
    Supports: Cura/PrusaSlicer (PNG), OrcaSlicer/BambuStudio (JPEG/PNG), \r\n line endings.
    """
    # Only scan first 128 KB — thumbnails are at the top; large 300x300 PNGs can be 50-80 KB base64
    header = gcode_bytes[:131072].decode("ascii", errors="ignore")

    # Matches both "thumbnail" (Cura/Prusa PNG) and "thumbnail_JPG" (Orca JPEG)
    # Handle \r\n and \n line endings
    pattern = re.compile(
        r"; thumbnail(?:_JPG)? begin (\d+)x(\d+) \d+\r?\n(.*?); thumbnail(?:_JPG)? end",
        re.DOTALL,
    )
    best: tuple[int, bytes] | None = None
    for m in pattern.finditer(header):
        w = int(m.group(1))
        raw = m.group(3)
        b64 = "".join(line.lstrip("; ").rstrip("\r\n") for line in raw.splitlines())
        try:
            data = base64.b64decode(b64)
        except Exception:
            continue
        if best is None or abs(w - prefer_size) < abs(best[0] - prefer_size):
            best = (w, data)
    return best[1] if best else None


_X_PATTERN = re.compile(r"X([-\d.]+)", re.I)
_Y_PATTERN = re.compile(r"Y([-\d.]+)", re.I)
_Z_PATTERN = re.compile(r"Z([-\d.]+)", re.I)
_EXTRUSION_PATTERN = re.compile(r"E[-\d.]+", re.I)

_MAXIMUM_LINES = 12000
_MINIMUM_POINTS = 20
_TARGET_POINTS = 4000
_BACKGROUND_COLOR = (20, 20, 20)

Point = tuple[float, float, float]
Pixel = tuple[int, int]


def _parse_extrusion_points(gcode_text: str) -> list[Point]:
    """Collect the position after every extrusion move (G0/G1 with E and X or Y), skipping travel moves."""
    x = y = z = 0.0
    points: list[Point] = []
    for line in gcode_text.splitlines()[:_MAXIMUM_LINES]:
        bare = line.split(";")[0].strip()
        if not bare.upper().startswith(("G0", "G1")):
            continue
        z_match = _Z_PATTERN.search(bare)
        x_match = _X_PATTERN.search(bare)
        y_match = _Y_PATTERN.search(bare)
        if z_match:
            z = float(z_match.group(1))
        if x_match:
            x = float(x_match.group(1))
        if y_match:
            y = float(y_match.group(1))
        if _EXTRUSION_PATTERN.search(bare) and (x_match or y_match):
            points.append((x, y, z))
    return points


def _project_isometric(point: Point) -> tuple[float, float]:
    """Isometric projection: yaw 45 degrees around the vertical axis, then pitch 30 degrees."""
    x, y, z = point
    yaw = math.radians(45)
    pitch = math.radians(30)
    rotated_x = x * math.cos(yaw) + z * math.sin(yaw)
    rotated_z = -x * math.sin(yaw) + z * math.cos(yaw)
    screen_y = y * math.cos(pitch) - rotated_z * math.sin(pitch)
    return rotated_x, screen_y


def _build_pixel_mapper(projected: list[tuple[float, float]], size: int) -> Callable[[float, float], Pixel]:
    xs = [position[0] for position in projected]
    ys = [position[1] for position in projected]
    minimum_x, minimum_y = min(xs), min(ys)
    extent = max(max(xs) - minimum_x, max(ys) - minimum_y) or 1.0
    margin = max(6, size // 14)
    scale = (size - 2 * margin) / extent

    def to_pixel(screen_x: float, screen_y: float) -> Pixel:
        return (
            int((screen_x - minimum_x) * scale) + margin,
            size - (int((screen_y - minimum_y) * scale) + margin),
        )

    return to_pixel


def _height_color(fraction: float) -> tuple[int, int, int]:
    """Dark teal at the base to bright cyan at the top."""
    return (int(fraction * 34), int(130 + fraction * 81), int(160 + fraction * 78))


def _draw_toolpath(
    draw: ImageDraw.ImageDraw,
    points: list[Point],
    projected: list[tuple[float, float]],
    to_pixel: Callable[[float, float], Pixel],
    size: int,
) -> None:
    heights = [point[2] for point in points]
    lowest = min(heights)
    height_range = max(heights) - lowest or 1.0
    previous_pixel: Pixel | None = None
    previous_height = 0.0
    for (screen_x, screen_y), height in zip(projected, heights):
        pixel = to_pixel(screen_x, screen_y)
        if previous_pixel and _is_connected(previous_pixel, pixel, previous_height, height, height_range, size):
            draw.line([previous_pixel, pixel], fill=_height_color((height - lowest) / height_range), width=1)
        previous_pixel = pixel
        previous_height = height


def _is_connected(
    previous: Pixel, current: Pixel, previous_height: float, height: float, height_range: float, size: int
) -> bool:
    if abs(height - previous_height) >= height_range * 0.3:
        return False
    return abs(current[0] - previous[0]) < size * 0.35 and abs(current[1] - previous[1]) < size * 0.35


def render_toolpath_thumbnail(gcode_bytes: bytes, size: int = 300) -> bytes | None:
    """Render an isometric 3D toolpath preview coloured by layer height."""
    points = _parse_extrusion_points(gcode_bytes.decode("ascii", errors="ignore"))
    if len(points) < _MINIMUM_POINTS:
        return None
    points = points[:: max(1, len(points) // _TARGET_POINTS)]  # thin down so rendering stays fast
    projected = [_project_isometric(point) for point in points]
    image = Image.new("RGB", (size, size), _BACKGROUND_COLOR)
    _draw_toolpath(ImageDraw.Draw(image), points, projected, _build_pixel_mapper(projected, size), size)
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def inject_thumbnails(
    gcode_bytes: bytes,
    thumbnails: list[tuple[int, int, bytes]],
) -> bytes:
    """Prepend Cura-format thumbnail comments to gcode bytes."""
    out = io.StringIO()
    for w, h, png in thumbnails:
        b64 = base64.b64encode(png).decode("ascii")
        out.write(f"; thumbnail begin {w}x{h} {len(b64)}\n")
        for i in range(0, len(b64), 78):
            out.write(f"; {b64[i : i + 78]}\n")
        out.write("; thumbnail end\n;\n")
    return out.getvalue().encode("ascii") + gcode_bytes
