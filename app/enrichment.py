import logging
import re
from collections.abc import Callable
from typing import Any

import httpx

log = logging.getLogger(__name__)

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


ClientFactory = Callable[..., httpx.AsyncClient]

_EMPTY_ENRICHMENT: dict[str, Any] = {"title": None, "description": None, "image_url": None, "print_settings": None}


def _makerworld_print_settings(data: dict[str, Any]) -> dict[str, Any]:
    """Project settings and compatibility of the first instance of a MakerWorld design."""
    instance = next(iter(data.get("instances", [])), None)
    if not instance:
        return {}
    extension = instance.get("extention", {}) or {}
    project_settings = extension.get("modelInfo", {}).get("projectSettings", {}) or {}
    compatibility = extension.get("modelInfo", {}).get("compatibility", {}) or {}
    settings: dict[str, Any] = {}
    if project_settings.get("layerHeight"):
        settings["layer_height"] = project_settings["layerHeight"] + "mm"
    if project_settings.get("wallLoops"):
        settings["walls"] = project_settings["wallLoops"]
    if project_settings.get("sparseInfillDensity"):
        settings["infill"] = project_settings["sparseInfillDensity"]
    if compatibility.get("nozzleDiameter"):
        settings["nozzle"] = str(compatibility["nozzleDiameter"]) + "mm"
    if compatibility.get("devProductName"):
        settings["printer"] = compatibility["devProductName"]
    return settings


async def _fetch_makerworld(url: str, client_factory: ClientFactory = httpx.AsyncClient) -> dict[str, Any]:
    """MakerWorld: uses public JSON API — returns title, cover, and print settings."""
    match = re.search(r"makerworld\.com/[^/]+/models/(\d+)", url)
    if not match:
        return {}
    async with client_factory(timeout=10) as client:
        response = await client.get(f"https://makerworld.com/api/v1/design-service/design/{match.group(1)}")
        response.raise_for_status()
        data = response.json()
    return {
        "title": data.get("title"),
        "description": data.get("summary"),
        "image_url": data.get("coverUrl"),
        "print_settings": _makerworld_print_settings(data) or None,
    }


def _printables_print_settings(model: dict[str, Any]) -> dict[str, Any]:
    settings: dict[str, Any] = {}
    if model.get("layerHeights"):
        settings["layer_height"] = model["layerHeights"]
    if model.get("nozzleDiameters"):
        settings["nozzle"] = model["nozzleDiameters"]
    materials = [material["name"] for material in (model.get("materials") or []) if material.get("name")]
    if materials:
        settings["material"] = ", ".join(materials)
    if model.get("weight"):
        settings["weight_g"] = str(model["weight"]) + "g"
    if model.get("numPieces"):
        settings["parts"] = str(model["numPieces"])
    return settings


async def _fetch_printables(url: str, client_factory: ClientFactory = httpx.AsyncClient) -> dict[str, Any]:
    """Printables: uses public GraphQL API — returns title, cover, and available print settings."""
    match = re.search(r"printables\.com/(?:model|[^/?#]+/models)/(\d+)", url)
    if not match:
        return {}
    query = f"""{{ print(id: {match.group(1)}) {{
        name summary image {{ filePath }}
        materials {{ name }} layerHeights nozzleDiameters printDuration weight numPieces
    }} }}"""
    async with client_factory(timeout=10) as client:
        response = await client.post("https://api.printables.com/graphql/", json={"query": query})
        response.raise_for_status()
        data = response.json()
    model = data.get("data", {}).get("print") or {}
    image_path = (model.get("image") or {}).get("filePath")
    return {
        "title": model.get("name"),
        "description": model.get("summary"),
        "image_url": f"https://media.printables.com/{image_path}" if image_path else None,
        "print_settings": _printables_print_settings(model) or None,
    }


def _find_open_graph_property(html: str, prop: str) -> str | None:
    for pattern in [
        rf'<meta[^>]+property=["\']og:{prop}["\'][^>]+content=["\']([^"\']*)["\']',
        rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']og:{prop}["\']',
    ]:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def _find_page_title(html: str) -> str | None:
    title = _find_open_graph_property(html, "title")
    if title:
        return title
    match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    return match.group(1).strip() if match else None


async def _fetch_open_graph(url: str, client_factory: ClientFactory) -> dict[str, Any]:
    """Generic OG scraping (Thingiverse, GitHub, any other URL)."""
    async with client_factory(follow_redirects=True, timeout=10) as client:
        response = await client.get(url, headers={"User-Agent": _BROWSER_UA})
        response.raise_for_status()
        html = response.text
    return {
        "title": _find_page_title(html),
        "description": _find_open_graph_property(html, "description"),
        "image_url": _find_open_graph_property(html, "image"),
        "print_settings": None,
    }


async def fetch_og(url: str, client_factory: ClientFactory = httpx.AsyncClient) -> dict[str, Any]:
    """Fetch enrichment metadata from a URL.

    Uses site-specific APIs where available, falls back to Open Graph scraping.
    Returns: {title, description, image_url, print_settings?}
    """
    try:
        if "makerworld.com" in url:
            return await _fetch_makerworld(url, client_factory)
        if "printables.com" in url:
            return await _fetch_printables(url, client_factory)
        return await _fetch_open_graph(url, client_factory)
    except Exception as exc:
        log.debug("enrichment fetch failed for %s: %s", url, exc)
        return dict(_EMPTY_ENRICHMENT)
