from collections.abc import Callable

import httpx

from app.enrichment import fetch_og

REAL_CLIENT = httpx.AsyncClient


def client_factory_answering(handler: Callable[[httpx.Request], httpx.Response]):
    def build(**options):
        return REAL_CLIENT(transport=httpx.MockTransport(handler), **options)

    return build


EMPTY = {"title": None, "description": None, "image_url": None, "print_settings": None}

MAKERWORLD_DESIGN = {
    "title": "Benchy",
    "summary": "A boat",
    "coverUrl": "https://cdn/cover.png",
    "instances": [
        {
            "extention": {
                "modelInfo": {
                    "projectSettings": {"layerHeight": "0.2", "wallLoops": 3, "sparseInfillDensity": "15%"},
                    "compatibility": {"nozzleDiameter": 0.4, "devProductName": "X1"},
                }
            }
        }
    ],
}

PRINTABLES_MODEL = {
    "data": {
        "print": {
            "name": "Clip",
            "summary": "A clip",
            "image": {"filePath": "media/clip.png"},
            "materials": [{"name": "PLA"}, {"name": None}, {"name": "PETG"}],
            "layerHeights": [0.2],
            "nozzleDiameters": [0.4],
            "weight": 12,
            "numPieces": 2,
        }
    }
}


async def test_makerworld_design_gives_title_cover_and_print_settings():
    factory = client_factory_answering(lambda request: httpx.Response(200, json=MAKERWORLD_DESIGN))
    result = await fetch_og("https://makerworld.com/en/models/123-benchy", factory)
    assert result == {
        "title": "Benchy",
        "description": "A boat",
        "image_url": "https://cdn/cover.png",
        "print_settings": {
            "layer_height": "0.2mm",
            "walls": 3,
            "infill": "15%",
            "nozzle": "0.4mm",
            "printer": "X1",
        },
    }


async def test_makerworld_design_without_instances_has_no_print_settings():
    factory = client_factory_answering(lambda request: httpx.Response(200, json={"title": "T", "instances": []}))
    result = await fetch_og("https://makerworld.com/en/models/123-t", factory)
    assert result["title"] == "T"
    assert result["print_settings"] is None


async def test_makerworld_url_without_model_id_gives_an_empty_result():
    factory = client_factory_answering(lambda request: httpx.Response(200, json=MAKERWORLD_DESIGN))
    assert await fetch_og("https://makerworld.com/nope", factory) == {}


async def test_printables_model_gives_title_image_and_print_settings():
    factory = client_factory_answering(lambda request: httpx.Response(200, json=PRINTABLES_MODEL))
    result = await fetch_og("https://www.printables.com/model/77-clip", factory)
    assert result == {
        "title": "Clip",
        "description": "A clip",
        "image_url": "https://media.printables.com/media/clip.png",
        "print_settings": {
            "layer_height": [0.2],
            "nozzle": [0.4],
            "material": "PLA, PETG",
            "weight_g": "12g",
            "parts": "2",
        },
    }


async def test_printables_model_that_does_not_exist_is_empty():
    factory = client_factory_answering(lambda request: httpx.Response(200, json={"data": {"print": None}}))
    assert await fetch_og("https://www.printables.com/model/77-x", factory) == EMPTY


async def test_open_graph_page_gives_title_description_and_image_in_either_attribute_order():
    html = (
        '<meta property="og:title" content=" Hi ">'
        '<meta content="Desc" property="og:description">'
        '<meta property="og:image" content="https://i/x.png">'
    )
    factory = client_factory_answering(lambda request: httpx.Response(200, text=html))
    assert await fetch_og("https://example.com/a", factory) == {
        "title": "Hi",
        "description": "Desc",
        "image_url": "https://i/x.png",
        "print_settings": None,
    }


async def test_page_without_open_graph_title_falls_back_to_the_title_tag():
    factory = client_factory_answering(lambda request: httpx.Response(200, text="<title> Plain </title>"))
    assert (await fetch_og("https://example.com/a", factory))["title"] == "Plain"


async def test_empty_open_graph_title_falls_back_to_nothing_without_a_title_tag():
    factory = client_factory_answering(
        lambda request: httpx.Response(200, text='<meta property="og:title" content="">')
    )
    assert await fetch_og("https://example.com/a", factory) == EMPTY


async def test_a_failing_request_gives_the_empty_result():
    factory = client_factory_answering(lambda request: httpx.Response(404))
    assert await fetch_og("https://example.com/a", factory) == EMPTY
