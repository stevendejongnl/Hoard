import re
import logging
import asyncio
from typing import Any
import httpx

log = logging.getLogger(__name__)

async def fetch_og(url: str) -> dict[str, str | None]:
    """Fetch Open Graph metadata from a URL. Returns {title, description, image_url}."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; printer-enricher/1.0)"})
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
