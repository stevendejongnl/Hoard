import asyncio

from app.main import _event_stream
from app.sse import hub


class FakeRequest:
    def __init__(self, disconnect_answers: list[bool]):
        self.disconnect_answers = disconnect_answers

    async def is_disconnected(self) -> bool:
        return self.disconnect_answers.pop(0)


async def test_event_stream_yields_queued_messages_until_the_client_disconnects():
    queue: asyncio.Queue[str] = asyncio.Queue()
    queue.put_nowait("data: one\n\n")
    queue.put_nowait("data: two\n\n")
    messages = [message async for message in _event_stream(FakeRequest([False, False, True]), queue)]
    assert messages == ["data: one\n\n", "data: two\n\n"]


async def test_event_stream_unsubscribes_the_queue_when_it_ends():
    queue = hub.subscribe()
    assert queue in hub._queues
    async for _ in _event_stream(FakeRequest([True]), queue):
        pass
    assert queue not in hub._queues
