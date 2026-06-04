import base64
import io
import re


def has_thumbnails(gcode_bytes: bytes) -> bool:
    return b"; thumbnail begin" in gcode_bytes[:8192]


def extract_thumbnail_png(gcode_bytes: bytes, prefer_size: int = 300) -> bytes | None:
    """Parse Cura-format thumbnail comments and return the PNG closest to prefer_size."""
    # Only scan first 128 KB — thumbnails are at the top; large 300x300 PNGs can be 50-80 KB base64
    header = gcode_bytes[:131072].decode("ascii", errors="ignore")

    pattern = re.compile(
        r"; thumbnail begin (\d+)x(\d+) \d+\n(.*?); thumbnail end",
        re.DOTALL,
    )
    best: tuple[int, bytes] | None = None
    for m in pattern.finditer(header):
        w = int(m.group(1))
        h = int(m.group(2))
        raw = m.group(3)
        b64 = "".join(line.lstrip("; ").rstrip() for line in raw.splitlines())
        try:
            png = base64.b64decode(b64)
        except Exception:
            continue
        size = w * h
        if best is None or abs(w - prefer_size) < abs(best[0] - prefer_size):
            best = (w, png)
    return best[1] if best else None


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
