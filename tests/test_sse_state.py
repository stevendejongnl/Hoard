from typing import Any

import pytest

from app import sse


class FakeHub:
    def __init__(self) -> None:
        self.broadcasts: list[tuple[str, dict[str, Any]]] = []
        self._cache: dict[str, dict[str, Any]] = {}

    def last_value(self, event: str) -> dict[str, Any]:
        return self._cache.get(event, {})

    async def broadcast(self, event: str, data: dict[str, Any]) -> None:
        self.broadcasts.append((event, data))
        self._cache[event] = data


class FakeTask:
    def __init__(self, coroutine: Any) -> None:
        self.coroutine = coroutine
        self.cancelled = False

    def cancel(self) -> None:
        self.cancelled = True


class FakeNotifier:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def notify(self, title: str, body: str, url: str = "/") -> None:
        self.sent.append((title, body, url))


class World:
    def __init__(self) -> None:
        self.hub = FakeHub()
        self.notifier = FakeNotifier()
        self.tasks: list[FakeTask] = []
        self.slept: list[float] = []

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)

    def create_task(self, coroutine: Any) -> FakeTask:
        task = FakeTask(coroutine)
        self.tasks.append(task)
        return task

    async def run_tasks(self) -> None:
        """Runs the coroutines that the handler started, unless the handler cancelled them."""
        for task in self.tasks:
            if task.cancelled:
                task.coroutine.close()
                continue
            await task.coroutine


def build_handler(world: World):
    tracker = sse.PrinterStateTracker(
        event_hub=world.hub,
        notifier=world.notifier,
        sleep=world.sleep,
        start_task=world.create_task,
    )
    return tracker.handle_status_update


def printer_states(world: World) -> list[dict[str, Any]]:
    return [data for event, data in world.hub.broadcasts if event == "printer_state"]


def temperatures(world: World) -> list[dict[str, Any]]:
    return [data for event, data in world.hub.broadcasts if event == "temps"]


EMPTY_STATE = {
    "state": "standby",
    "filename": "",
    "progress": 0,
    "layer": None,
    "layer_total": None,
    "time_remaining": 0,
    "filament_used": 0,
    "speed": 0,
    "z_position": 0,
}


async def test_nothing_happens_without_parameters_or_with_a_parameter_that_is_no_dictionary() -> None:
    world = World()
    handle = build_handler(world)
    await handle([])
    await handle(["text"])
    assert world.hub.broadcasts == []


async def test_an_update_without_printer_fields_broadcasts_nothing_for_the_printer() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"toolhead": {}}])
    assert world.hub.broadcasts == []


async def test_the_printer_state_is_built_from_the_print_stats_the_progress_and_the_motion() -> None:
    world = World()
    handle = build_handler(world)
    await handle(
        [
            {
                "print_stats": {
                    "state": "printing",
                    "filename": "benchy.gcode",
                    "print_duration": 120.5,
                    "filament_used": 800.25,
                    "info": {"current_layer": 3, "total_layer": 90},
                },
                "display_status": {"progress": 0.4256},
                "motion_report": {"live_velocity": 12.345, "live_position": [1, 2, 0.30049]},
            }
        ]
    )
    assert printer_states(world) == [
        {
            "state": "printing",
            "filename": "benchy.gcode",
            "progress": 42.6,
            "layer": 3,
            "layer_total": 90,
            "time_remaining": 120.5,
            "filament_used": 800.25,
            "speed": 12.3,
            "z_position": 0.3,
        }
    ]
    assert world.notifier.sent == []


async def test_fields_that_are_not_in_the_update_keep_the_last_known_value() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "printing", "filename": "a.gcode", "info": {"current_layer": 2}}}])
    await handle([{"display_status": {"progress": 0.5}}])
    second = printer_states(world)[1]
    assert (second["state"], second["filename"], second["layer"], second["progress"]) == (
        "printing",
        "a.gcode",
        2,
        50.0,
    )


async def test_a_motion_report_with_a_short_position_leaves_the_height_alone() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"motion_report": {"live_position": [1, 2]}}])
    assert printer_states(world) == [EMPTY_STATE]


async def test_info_without_layer_numbers_leaves_the_layers_alone() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"info": {"current_layer": None, "total_layer": None}}}])
    assert printer_states(world) == [EMPTY_STATE]


async def test_standby_during_a_print_is_held_back_for_eight_seconds() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "printing", "filename": "a.gcode"}}])
    await handle([{"print_stats": {"state": "standby"}, "extruder": {"temperature": 200.0}}])
    assert [state["state"] for state in printer_states(world)] == ["printing"]
    assert temperatures(world) == []
    await world.run_tasks()
    assert world.slept == [8]
    assert [state["state"] for state in printer_states(world)] == ["printing", "standby"]


async def test_a_new_standby_replaces_the_held_back_one() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "paused"}}])
    await handle([{"print_stats": {"state": "standby"}}])
    await handle([{"print_stats": {"state": "standby"}}])
    assert [task.cancelled for task in world.tasks] == [True, False]
    await world.run_tasks()


async def test_a_state_update_cancels_a_held_back_standby() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "printing"}}])
    await handle([{"print_stats": {"state": "standby"}}])
    await handle([{"print_stats": {"state": "printing", "filament_used": 5}}])
    assert world.tasks[0].cancelled
    await world.run_tasks()
    assert [state["state"] for state in printer_states(world)] == ["printing", "printing"]


async def test_standby_after_idle_is_broadcast_at_once() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "standby"}}])
    assert len(printer_states(world)) == 1
    assert world.tasks == []


@pytest.mark.parametrize(
    ("final_state", "title", "body"),
    [
        ("complete", "Print complete", "benchy.gcode finished printing."),
        ("error", "Print failed", "benchy.gcode hit an error."),
        ("cancelled", "Print cancelled", "benchy.gcode was cancelled."),
    ],
)
async def test_a_print_that_ends_sends_a_push_message(final_state, title, body) -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "printing", "filename": "benchy.gcode"}}])
    await handle([{"print_stats": {"state": final_state}}])
    await world.run_tasks()
    assert world.notifier.sent == [(title, body, "/")]
    assert printer_states(world)[-1]["state"] == final_state


async def test_a_finished_print_without_a_filename_is_called_print() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "paused"}}])
    await handle([{"print_stats": {"state": "complete"}}])
    await world.run_tasks()
    assert world.notifier.sent == [("Print complete", "Print finished printing.", "/")]


async def test_a_state_that_ends_without_a_print_before_it_sends_no_push_message() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "standby"}}])
    await handle([{"print_stats": {"state": "complete"}}])
    await handle([{"print_stats": {"state": "complete"}}])
    await world.run_tasks()
    assert world.notifier.sent == []


async def test_the_temperatures_are_broadcast_rounded_with_the_last_known_values_as_default() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"extruder": {"temperature": 210.04, "target": 215.0}, "heater_bed": {"temperature": 59.96}}])
    await handle([{"heater_bed": {"target": 60}}])
    assert temperatures(world) == [
        {"hotend_actual": 210.0, "hotend_target": 215.0, "bed_actual": 60.0, "bed_target": 0},
        {"hotend_actual": 210.0, "hotend_target": 215.0, "bed_actual": 60.0, "bed_target": 60},
    ]


async def test_one_update_can_carry_the_printer_and_the_temperatures() -> None:
    world = World()
    handle = build_handler(world)
    await handle([{"print_stats": {"state": "printing"}, "extruder": {"temperature": 1.0}}])
    assert [event for event, _ in world.hub.broadcasts] == ["printer_state", "temps"]
