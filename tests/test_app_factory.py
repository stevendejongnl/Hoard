from types import SimpleNamespace

import httpx

from app.main import create_app
from app.mcp.tokens import hash_token

TOOLS_LIST = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}


def create_settings(**overrides) -> SimpleNamespace:
    values = {"database_path": "", "redis_url": "", "static_dir": "", "mcp_clients": ""}
    return SimpleNamespace(**{**values, **overrides})


def create_static_site(directory) -> None:
    (directory / "assets").mkdir(parents=True)
    (directory / "index.html").write_text("<p>index</p>")
    (directory / "sw.js").write_text("// worker")


async def request(app, method: str, path: str, **options) -> httpx.Response:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://hoard") as client:
        return await client.request(method, path, **options)


async def test_the_app_answers_mcp_to_the_clients_of_the_settings_it_is_given():
    app = create_app(create_settings(mcp_clients=f"claude:read:{hash_token('given-token')}"))
    authorization = {"Authorization": "Bearer given-token"}
    response = await request(app, "POST", "/mcp", json=TOOLS_LIST, headers=authorization)
    assert response.status_code == 200


async def test_the_app_refuses_mcp_when_the_settings_it_is_given_have_no_clients():
    app = create_app(create_settings())
    authorization = {"Authorization": "Bearer given-token"}
    response = await request(app, "POST", "/mcp", json=TOOLS_LIST, headers=authorization)
    assert response.status_code == 401


async def test_the_app_serves_the_site_from_the_static_directory_of_its_settings(tmp_path):
    create_static_site(tmp_path / "site")
    app = create_app(create_settings(static_dir=str(tmp_path / "site")))
    page = await request(app, "GET", "/projects/3")
    worker = await request(app, "GET", "/sw.js")
    assert page.text == "<p>index</p>"
    assert worker.text == "// worker"
    assert worker.headers["cache-control"] == "no-cache"


async def test_the_app_serves_no_site_when_its_static_directory_does_not_exist(tmp_path):
    app = create_app(create_settings(static_dir=str(tmp_path / "missing")))
    response = await request(app, "GET", "/projects/3")
    assert response.status_code == 404
