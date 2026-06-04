import base64
import io
import math
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
    """Render an isometric 3D toolpath preview coloured by layer height."""
    text = gcode_bytes.decode("ascii", errors="ignore")

    # Parse extrusion moves (G1 with E field) — skip travel moves
    _x = re.compile(r"X([-\d.]+)", re.I)
    _y = re.compile(r"Y([-\d.]+)", re.I)
    _z = re.compile(r"Z([-\d.]+)", re.I)
    _e = re.compile(r"E[-\d.]+", re.I)

    cx = cy = cz = 0.0
    points: list[tuple[float, float, float]] = []

    for line in text.splitlines()[:12000]:
        bare = line.split(";")[0].strip()
        if not bare.upper().startswith(("G0", "G1")):
            continue
        zm = _z.search(bare)
        xm = _x.search(bare)
        ym = _y.search(bare)
        if zm:
            cz = float(zm.group(1))
        if xm:
            cx = float(xm.group(1))
        if ym:
            cy = float(ym.group(1))
        # Only record actual extrusion moves (not travels)
        if _e.search(bare) and (xm or ym):
            points.append((cx, cy, cz))

    if len(points) < 20:
        return None

    # Thin down to ~4 000 points so rendering stays fast
    step = max(1, len(points) // 4000)
    points = points[::step]

    # Isometric projection: yaw 45°, pitch 30°
    yaw = math.radians(45)
    pitch = math.radians(30)
    cos_y, sin_y = math.cos(yaw), math.sin(yaw)
    cos_p, sin_p = math.cos(pitch), math.sin(pitch)

    def iso(x: float, y: float, z: float) -> tuple[float, float]:
        # Rotate around vertical (Y) axis first
        x2 = x * cos_y + z * sin_y
        z2 = -x * sin_y + z * cos_y
        # Then tilt (rotate around X)
        sy = y * cos_p - z2 * sin_p
        return x2, sy

    projected = [iso(x, y, z) for x, y, z in points]
    sxs = [p[0] for p in projected]
    sys_ = [p[1] for p in projected]
    min_sx, max_sx = min(sxs), max(sxs)
    min_sy, max_sy = min(sys_), max(sys_)
    rng = max(max_sx - min_sx, max_sy - min_sy) or 1.0

    margin = max(6, size // 14)
    canvas = size - 2 * margin
    scale = canvas / rng

    def to_px(sx: float, sy: float) -> tuple[int, int]:
        return (
            int((sx - min_sx) * scale) + margin,
            size - (int((sy - min_sy) * scale) + margin),
        )

    # Z range for height colour
    zs = [p[2] for p in points]
    z_min, z_max = min(zs), max(zs)
    z_rng = z_max - z_min or 1.0

    img = Image.new("RGB", (size, size), (20, 20, 20))
    draw = ImageDraw.Draw(img)

    prev_px: tuple[int, int] | None = None
    prev_z: float = 0.0
    for (sx, sy), (_, _, pz) in zip(projected, points):
        px = to_px(sx, sy)
        # Height-based colour: dark teal at base → bright cyan at top
        t = (pz - z_min) / z_rng
        color = (int(t * 34), int(130 + t * 81), int(160 + t * 78))
        if prev_px and abs(pz - prev_z) < z_rng * 0.3:
            dx, dy = abs(px[0] - prev_px[0]), abs(px[1] - prev_px[1])
            if dx < size * 0.35 and dy < size * 0.35:
                draw.line([prev_px, px], fill=color, width=1)
        prev_px = px
        prev_z = pz

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
