"""A small backend for the pixel parity checks.

It answers the app's `/api` requests with injected JSON and keeps `/stream` open as a server-sent
events stream that starts with the injected events. The responses and events are arguments, so tests
can use tiny data and the parity run uses the design's data (see fixture_data.py).
"""

import functools
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

STREAM_PATH = "/stream"
STREAM_POLL_SECONDS = 0.1

JsonValue = Any
ServerSentEvent = tuple[str, JsonValue]


class MockBackendServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, handler_class):
        super().__init__(address, handler_class)
        self.is_stopping = threading.Event()

    def shutdown(self) -> None:
        self.is_stopping.set()
        super().shutdown()
        self.server_close()


class MockBackendHandler(BaseHTTPRequestHandler):
    def __init__(self, responses: dict[str, JsonValue], events: list[ServerSentEvent], *arguments, **keyword_arguments):
        self.responses = responses
        self.events = events
        super().__init__(*arguments, **keyword_arguments)

    def log_message(self, format, *arguments) -> None:
        return

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == STREAM_PATH:
            self.stream_events()
            return
        if path in self.responses:
            self.send_json(self.responses[path])
            return
        self.send_error(404, "Not found")

    def send_json(self, value: JsonValue) -> None:
        body = json.dumps(value).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def format_event(self, name: str, data: JsonValue) -> bytes:
        return f"event: {name}\ndata: {json.dumps(data)}\n\n".encode()

    def stream_events(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        for name, data in self.events:
            self.wfile.write(self.format_event(name, data))
        self.wfile.flush()
        self.keep_connection_open()

    def keep_connection_open(self) -> None:
        while not self.server.is_stopping.is_set():
            time.sleep(STREAM_POLL_SECONDS)


def start_mock_backend(
    responses: dict[str, JsonValue], events: list[ServerSentEvent], port: int = 0
) -> MockBackendServer:
    handler_class = functools.partial(MockBackendHandler, responses, events)
    server = MockBackendServer(("127.0.0.1", port), handler_class)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
