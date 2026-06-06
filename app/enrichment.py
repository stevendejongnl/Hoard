import re
import logging
from typing import Any
import httpx

log = logging.getLogger(__name__)

_BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"


async def _fetch_makerworld(url: str) -> dict[str, str | None]:
    """MakerWorld blocks scraping but has a public JSON API."""
    m = re.search(r'makerworld\.com/[^/]+/models/(\d+)', url)
    if not m:
        return {"title": None, "description": None, "image_url": None}
    design_id = m.group(1)
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"https://makerworld.com/api/v1/design-service/design/{design_id}")
        r.raise_for_status()
        data = r.json()
    return {
        "title": data.get("title"),
        "description": data.get("summary") or data.get("description"),
        "image_url": data.get("coverUrl"),
    }


async def fetch_og(url: str) -> dict[str, str | None]:
    """Fetch enrichment metadata from a URL.

    Uses site-specific APIs where available (MakerWorld), falls back to
    Open Graph scraping for everything else.
    """
    try:
        if "makerworld.com" in url:
            return await _fetch_makerworld(url)

        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            r = await client.get(url, headers={"User-Agent": _BROWSER_UA})
            r.raise_for_status()
            html = r.text

        def _og(prop: str) -> str | None:
            for pattern in [
                rf'<meta[^>]+property=["\']og:{prop}["\'][^>]+content=["\']([^"\']*)["\']',
                rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']og:{prop}["\']',
            ]:
                m = re.search(pattern, html, re.IGNORECASE)
                if m:
                    return m.group(1).strip()
            return None

        title = _og("title")
        if not title:
            m = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
            title = m.group(1).strip() if m else None

        return {"title": title, "description": _og("description"), "image_url": _og("image")}

    except Exception as exc:
        log.debug("enrichment fetch failed for %s: %s", url, exc)
        return {"title": None, "description": None, "image_url": None}
