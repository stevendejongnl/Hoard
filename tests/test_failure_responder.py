from dataclasses import replace

from app.detection_settings import DetectionSettings
from app.detectors import Detection
from app.failure_response import FailureResponder
from app.spaghetti_watch import FailureReport

REPORT = FailureReport("benchy.gcode", 0.82, [Detection("failure", 0.82, (1.0, 2.0, 3.0, 4.0))])


class FakeAlertStore:
    def __init__(self) -> None:
        self.saved: list[FailureReport] = []
        self.failure: Exception | None = None

    async def save(self, report: FailureReport) -> int:
        if self.failure:
            raise self.failure
        self.saved.append(report)
        return 7


class FakeNotifier:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str, str]] = []
        self.failure: Exception | None = None

    async def __call__(self, title: str, body: str, url: str = "/") -> None:
        if self.failure:
            raise self.failure
        self.messages.append((title, body, url))


class FakePrinter:
    def __init__(self) -> None:
        self.paused = 0
        self.failure: Exception | None = None

    async def __call__(self) -> None:
        if self.failure:
            raise self.failure
        self.paused += 1


def make_responder(action: str = "notify") -> tuple[FailureResponder, FakeAlertStore, FakeNotifier, FakePrinter]:
    store, notifier, printer = FakeAlertStore(), FakeNotifier(), FakePrinter()

    async def load_settings() -> DetectionSettings:
        return replace(DetectionSettings(), action=action)

    return FailureResponder(store, notifier, printer, load_settings), store, notifier, printer


async def test_an_alert_is_saved_and_the_owner_is_notified():
    responder, store, notifier, printer = make_responder()
    await responder.respond(REPORT)
    assert store.saved == [REPORT]
    [(title, body, url)] = notifier.messages
    assert "benchy.gcode" in body and "82" in body
    assert title
    assert url == "/detections"
    assert printer.paused == 0


async def test_with_the_pause_action_the_print_is_paused_too():
    responder, _, notifier, printer = make_responder("pause")
    await responder.respond(REPORT)
    assert printer.paused == 1
    assert "paused" in notifier.messages[0][1].lower()


async def test_a_print_that_cannot_be_paused_still_notifies_and_says_so():
    responder, _, notifier, printer = make_responder("pause")
    printer.failure = RuntimeError("printer does not answer")
    await responder.respond(REPORT)
    assert "could not be paused" in notifier.messages[0][1].lower()


async def test_an_alert_that_cannot_be_saved_still_notifies_and_pauses():
    responder, store, notifier, printer = make_responder("pause")
    store.failure = RuntimeError("disk full")
    await responder.respond(REPORT)
    assert len(notifier.messages) == 1
    assert printer.paused == 1


async def test_a_notification_that_fails_does_not_stop_the_pause():
    responder, _, notifier, printer = make_responder("pause")
    notifier.failure = RuntimeError("push is down")
    await responder.respond(REPORT)
    assert printer.paused == 1
