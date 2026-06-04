import base64
import io
import re
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


def render_toolpath_thumbnail(gcode_bytes: bytes, size: int = 300) -> bytes | None:
    """Render a top-down toolpath preview from gcode when no embedded thumbnail exists."""
    text = gcode_bytes.decode("ascii", errors="ignore")

    # Parse X Y from G0/G1 moves — captures first-layer footprint from first 128 KB
    xy = re.compile(r"G[01]\b[^;\n]*X([-\d.]+)[^;\n]*Y([-\d.]+)", re.IGNORECASE)
    points: list[tuple[float, float]] = []
    for m in xy.finditer(text):
        try:
            points.append((float(m.group(1)), float(m.group(2))))
        except ValueError:
            continue

    if len(points) < 20:
        return None

    xs, ys = zip(*points)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    rx = max_x - min_x or 1.0
    ry = max_y - min_y or 1.0

    margin = max(8, size // 12)
    canvas = size - 2 * margin

    def to_px(x: float, y: float) -> tuple[int, int]:
        return (
            int((x - min_x) / rx * canvas) + margin,
            size - (int((y - min_y) / ry * canvas) + margin),
        )

    img = Image.new("RGB", (size, size), (20, 20, 20))
    draw = ImageDraw.Draw(img)
    prev: tuple[int, int] | None = None
    for pt in points:
        px = to_px(*pt)
        if prev and prev != px:
            draw.line([prev, px], fill=(34, 211, 238), width=1)
        prev = px

    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    buf.seek(0)
    return buf.read()


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
            out.write(f"; {b64[i:i+78]}\n")
        out.write("; thumbnail end\n;\n")
    return out.getvalue().encode("ascii") + gcode_bytes
