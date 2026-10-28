import logging
import re
from typing import Any

import httpx

log = logging.getLogger(__name__)

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


async def _fetch_makerworld(url: str) -> dict[str, Any]:
    """MakerWorld: uses public JSON API — returns title, cover, and print settings."""
    m = re.search(r"makerworld\.com/[^/]+/models/(\d+)", url)
    if not m:
        return {}
    design_id = m.group(1)
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"https://makerworld.com/api/v1/design-service/design/{design_id}")
        r.raise_for_status()
        data = r.json()

    # Grab first instance's project settings + compatibility
    settings: dict[str, Any] = {}
    instance = next(iter(data.get("instances", [])), None)
    if instance:
        ext = instance.get("extention", {}) or {}
        ps = ext.get("modelInfo", {}).get("projectSettings", {}) or {}
        compat = ext.get("modelInfo", {}).get("compatibility", {}) or {}
        if ps.get("layerHeight"):
            settings["layer_height"] = ps["layerHeight"] + "mm"
        if ps.get("wallLoops"):
            settings["walls"] = ps["wallLoops"]
        if ps.get("sparseInfillDensity"):
            settings["infill"] = ps["sparseInfillDensity"]
        if compat.get("nozzleDiameter"):
            settings["nozzle"] = str(compat["nozzleDiameter"]) + "mm"
        if compat.get("devProductName"):
            settings["printer"] = compat["devProductName"]

    return {
        "title": data.get("title"),
        "description": data.get("summary"),
        "image_url": data.get("coverUrl"),
        "print_settings": settings or None,
    }


async def _fetch_printables(url: str) -> dict[str, Any]:
    """Printables: uses public GraphQL API — returns title, cover, and available print settings."""
    m = re.search(r"printables\.com/(?:model|[^/?#]+/models)/(\d+)", url)
    if not m:
        return {}
    model_id = m.group(1)
    query = f"""{{ print(id: {model_id}) {{
        name summary image {{ filePath }}
        materials {{ name }} layerHeights nozzleDiameters printDuration weight numPieces
    }} }}"""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post("https://api.printables.com/graphql/", json={"query": query})
        r.raise_for_status()
        data = r.json()

    p = data.get("data", {}).get("print") or {}
    image_path = (p.get("image") or {}).get("filePath")
    image_url = f"https://media.printables.com/{image_path}" if image_path else None

    settings: dict[str, Any] = {}
    if p.get("layerHeights"):
        settings["layer_height"] = p["layerHeights"]
    if p.get("nozzleDiameters"):
        settings["nozzle"] = p["nozzleDiameters"]
    materials = [mat["name"] for mat in (p.get("materials") or []) if mat.get("name")]
    if materials:
        settings["material"] = ", ".join(materials)
    if p.get("weight"):
        settings["weight_g"] = str(p["weight"]) + "g"
    if p.get("numPieces"):
        settings["parts"] = str(p["numPieces"])

    return {
        "title": p.get("name"),
        "description": p.get("summary"),
        "image_url": image_url,
        "print_settings": settings or None,
    }


async def fetch_og(url: str) -> dict[str, Any]:
    """Fetch enrichment metadata from a URL.

    Uses site-specific APIs where available, falls back to Open Graph scraping.
    Returns: {title, description, image_url, print_settings?}
    """
    try:
        if "makerworld.com" in url:
            return await _fetch_makerworld(url)
        if "printables.com" in url:
            return await _fetch_printables(url)

        # Generic OG scraping (Thingiverse, GitHub, any other URL)
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
            m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
            title = m.group(1).strip() if m else None

        return {
            "title": title,
            "description": _og("description"),
            "image_url": _og("image"),
            "print_settings": None,
        }

    except Exception as exc:
        log.debug("enrichment fetch failed for %s: %s", url, exc)
        return {"title": None, "description": None, "image_url": None, "print_settings": None}
