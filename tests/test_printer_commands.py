import pytest
from httpx import AsyncClient

from tests.route_fakes import FakeMoonraker, install_fakes

STATE_PATH = "/printer/objects/query"
GCODE_PATH = "/printer/gcode/script"


def printer_in_state(state: str) -> FakeMoonraker:
    return FakeMoonraker({STATE_PATH: {"status": {"print_stats": {"state": state}}}})


def scripts(moonraker: FakeMoonraker) -> list[str]:
    return [data["script"] for path, data in moonraker.posted if path == GCODE_PATH]


async def command(client: AsyncClient, monkeypatch, state: str, route: str, body: dict | None = None):
    moonraker = printer_in_state(state)
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post(f"/api/control/{route}", json=body or {})
    return response, moonraker


LOCKED_WHILE_PRINTING = [
    ("move", {"axis": "x", "distance": 10}),
    ("home", {}),
    ("extrude", {"length": 5}),
    ("macro", {"name": "CLEAN_NOZZLE"}),
    ("gcode", {"script": "M115"}),
    ("calibrate/bed_mesh", {}),
]

OPEN_WHILE_PRINTING = [
    ("temperature", {"heater": "extruder", "target": 200}),
    ("speed", {"percent": 110}),
    ("flow", {"percent": 95}),
    ("fan", {"percent": 50}),
    ("babystep", {"offset": 0.05}),
]


@pytest.mark.parametrize("state", ["printing", "paused"])
@pytest.mark.parametrize(("route", "body"), LOCKED_WHILE_PRINTING)
async def test_a_command_that_moves_or_runs_code_is_locked_during_a_print(
    client: AsyncClient, monkeypatch, state, route, body
):
    response, moonraker = await command(client, monkeypatch, state, route, body)
    assert (response.status_code, response.json()["detail"]) == (409, "Locked while the printer is printing")
    assert moonraker.posted == []


@pytest.mark.parametrize("state", ["printing", "paused"])
@pytest.mark.parametrize(("route", "body"), OPEN_WHILE_PRINTING)
async def test_tuning_stays_available_during_a_print(client: AsyncClient, monkeypatch, state, route, body):
    response, moonraker = await command(client, monkeypatch, state, route, body)
    assert response.status_code == 200
    assert len(scripts(moonraker)) == 1


@pytest.mark.parametrize(("route", "body"), LOCKED_WHILE_PRINTING)
async def test_a_command_is_refused_when_the_print_state_cannot_be_read(client: AsyncClient, monkeypatch, route, body):
    moonraker = FakeMoonraker({STATE_PATH: RuntimeError("offline")})
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post(f"/api/control/{route}", json=body)
    assert (response.status_code, response.json()["detail"]) == (502, "offline")
    assert moonraker.posted == []


async def test_the_lock_is_reported(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer_in_state("printing"))
    assert (await client.get("/api/control/lock")).json() == {"locked": True, "state": "printing"}
    install_fakes(monkeypatch, moonraker=printer_in_state("standby"))
    assert (await client.get("/api/control/lock")).json() == {"locked": False, "state": "standby"}


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"axis": "x", "distance": 10}, ["G91", "G1 X10 F6000", "G90"]),
        ({"axis": "y", "distance": -1}, ["G91", "G1 Y-1 F6000", "G90"]),
        ({"axis": "z", "distance": 0.1, "speed": 600}, ["G91", "G1 Z0.1 F600", "G90"]),
    ],
)
async def test_a_jog_moves_one_axis_by_a_relative_distance(client: AsyncClient, monkeypatch, body, expected):
    response, moonraker = await command(client, monkeypatch, "standby", "move", body)
    assert response.status_code == 200
    assert scripts(moonraker) == ["\n".join(expected)]


@pytest.mark.parametrize(
    "body",
    [
        {"axis": "e", "distance": 1},
        {"axis": "x", "distance": 500},
        {"axis": "x", "distance": 0},
        {"axis": "x", "distance": 1, "speed": 0},
        {"axis": "x", "distance": 1, "speed": 99999},
    ],
)
async def test_a_jog_outside_the_limits_is_refused(client: AsyncClient, monkeypatch, body):
    response, moonraker = await command(client, monkeypatch, "standby", "move", body)
    assert response.status_code == 422
    assert moonraker.posted == []


@pytest.mark.parametrize(
    ("body", "expected"),
    [({}, "G28"), ({"axes": ["x", "y"]}, "G28 X Y"), ({"axes": ["z"]}, "G28 Z")],
)
async def test_homing_homes_all_axes_or_the_chosen_ones(client: AsyncClient, monkeypatch, body, expected):
    response, moonraker = await command(client, monkeypatch, "standby", "home", body)
    assert response.status_code == 200
    assert scripts(moonraker) == [expected]


async def test_homing_an_unknown_axis_is_refused(client: AsyncClient, monkeypatch):
    response, _ = await command(client, monkeypatch, "standby", "home", {"axes": ["q"]})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"length": 10}, ["M83", "G1 E10 F300"]),
        ({"length": -5, "speed": 600}, ["M83", "G1 E-5 F600"]),
    ],
)
async def test_extruding_and_retracting_use_relative_extrusion(client: AsyncClient, monkeypatch, body, expected):
    response, moonraker = await command(client, monkeypatch, "standby", "extrude", body)
    assert response.status_code == 200
    assert scripts(moonraker) == ["\n".join(expected)]


async def test_extruding_too_much_in_one_go_is_refused(client: AsyncClient, monkeypatch):
    response, _ = await command(client, monkeypatch, "standby", "extrude", {"length": 500})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"heater": "extruder", "target": 205}, "SET_HEATER_TEMPERATURE HEATER=extruder TARGET=205"),
        ({"heater": "heater_bed", "target": 60}, "SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=60"),
        ({"heater": "heater_bed", "target": 0}, "SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=0"),
    ],
)
async def test_a_heater_is_set_to_a_target(client: AsyncClient, monkeypatch, body, expected):
    response, moonraker = await command(client, monkeypatch, "standby", "temperature", body)
    assert response.status_code == 200
    assert scripts(moonraker) == [expected]


@pytest.mark.parametrize(
    "body",
    [
        {"heater": "chamber", "target": 40},
        {"heater": "extruder", "target": 400},
        {"heater": "heater_bed", "target": 200},
        {"heater": "extruder", "target": -1},
    ],
)
async def test_a_heater_target_outside_the_limits_is_refused(client: AsyncClient, monkeypatch, body):
    response, moonraker = await command(client, monkeypatch, "standby", "temperature", body)
    assert response.status_code == 422
    assert moonraker.posted == []


@pytest.mark.parametrize(
    ("route", "body", "expected"),
    [
        ("speed", {"percent": 120}, "M220 S120"),
        ("flow", {"percent": 90}, "M221 S90"),
        ("fan", {"percent": 100}, "M106 S255"),
        ("fan", {"percent": 0}, "M106 S0"),
        ("fan", {"percent": 50}, "M106 S128"),
        ("babystep", {"offset": -0.025}, "SET_GCODE_OFFSET Z_ADJUST=-0.025 MOVE=1"),
    ],
)
async def test_speed_flow_fan_and_babystep_become_one_gcode_line(
    client: AsyncClient, monkeypatch, route, body, expected
):
    response, moonraker = await command(client, monkeypatch, "standby", route, body)
    assert response.status_code == 200
    assert scripts(moonraker) == [expected]


@pytest.mark.parametrize(
    ("route", "body"),
    [
        ("speed", {"percent": 5}),
        ("speed", {"percent": 500}),
        ("flow", {"percent": 10}),
        ("fan", {"percent": 101}),
        ("babystep", {"offset": 2}),
    ],
)
async def test_speed_flow_fan_and_babystep_outside_the_limits_are_refused(
    client: AsyncClient, monkeypatch, route, body
):
    response, moonraker = await command(client, monkeypatch, "standby", route, body)
    assert response.status_code == 422
    assert moonraker.posted == []


async def test_a_macro_is_run_by_name(client: AsyncClient, monkeypatch):
    response, moonraker = await command(client, monkeypatch, "standby", "macro", {"name": "CLEAN_NOZZLE"})
    assert response.status_code == 200
    assert scripts(moonraker) == ["CLEAN_NOZZLE"]


@pytest.mark.parametrize("name", ["CLEAN NOZZLE", "G28\nM112", "", "a;b"])
async def test_a_macro_name_that_is_not_a_name_is_refused(client: AsyncClient, monkeypatch, name):
    response, moonraker = await command(client, monkeypatch, "standby", "macro", {"name": name})
    assert response.status_code == 422
    assert moonraker.posted == []


async def test_the_console_runs_a_line_of_gcode(client: AsyncClient, monkeypatch):
    response, moonraker = await command(client, monkeypatch, "standby", "gcode", {"script": "M115"})
    assert response.status_code == 200
    assert scripts(moonraker) == ["M115"]


async def test_the_console_refuses_an_empty_line(client: AsyncClient, monkeypatch):
    response, _ = await command(client, monkeypatch, "standby", "gcode", {"script": "  "})
    assert response.status_code == 422


async def test_the_macros_are_listed_from_the_printer_objects(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker(
        {"/printer/objects/list": {"objects": ["extruder", "gcode_macro CLEAN_NOZZLE", "gcode_macro _HIDDEN", "fan"]}}
    )
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/control/macros")).json() == ["CLEAN_NOZZLE"]


@pytest.mark.parametrize(
    ("step", "expected"),
    [
        ("bed_mesh", "BED_MESH_CALIBRATE"),
        ("screws_tilt", "SCREWS_TILT_CALCULATE"),
        ("manual_probe", "MANUAL_PROBE"),
        ("probe_up", "TESTZ Z=+0.1"),
        ("probe_down", "TESTZ Z=-0.1"),
        ("accept", "ACCEPT"),
        ("abort", "ABORT"),
    ],
)
async def test_the_calibration_steps_run_their_klipper_command(client: AsyncClient, monkeypatch, step, expected):
    response, moonraker = await command(client, monkeypatch, "standby", f"calibrate/{step}", {})
    assert response.status_code == 200
    assert scripts(moonraker) == [expected]


async def test_a_calibration_step_that_does_not_exist_is_a_404(client: AsyncClient, monkeypatch):
    response, _ = await command(client, monkeypatch, "standby", "calibrate/everything", {})
    assert response.status_code == 404


async def test_the_bed_mesh_is_read_from_the_printer(client: AsyncClient, monkeypatch):
    mesh = {"profile_name": "default", "mesh_min": [10, 10], "mesh_max": [200, 200], "probed_matrix": [[0.1, 0.2]]}
    moonraker = FakeMoonraker({STATE_PATH: {"status": {"bed_mesh": mesh}}})
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/control/bed_mesh")).json() == mesh
    assert moonraker.asked == [(STATE_PATH, {"bed_mesh": ""})]


async def test_a_command_the_printer_refuses_is_a_502(client: AsyncClient, monkeypatch):
    moonraker = printer_in_state("standby")
    install_fakes(monkeypatch, moonraker=moonraker)
    moonraker.failure = RuntimeError("Must home axis first")
    response = await client.post("/api/control/move", json={"axis": "z", "distance": 1})
    assert (response.status_code, response.json()["detail"]) == (502, "Must home axis first")


STATUS_OBJECTS = {
    "status": {
        "print_stats": {"state": "standby"},
        "toolhead": {"position": [120.0, 110.0, 24.4, 0.0], "homed_axes": "xyz"},
        "extruder": {"temperature": 205.34, "target": 210.0},
        "heater_bed": {"temperature": 59.9, "target": 60.0},
        "fan": {"speed": 0.5},
        "gcode_move": {"speed_factor": 1.0, "extrude_factor": 0.98, "homing_origin": [0, 0, -0.12, 0]},
        "fan_generic aux": {"speed": 0.0},
    }
}
STATUS_LIST = {"objects": ["extruder", "fan", "fan_generic aux", "heater_bed", "gcode_macro X"]}


async def test_the_status_gathers_what_the_cards_show(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker({STATE_PATH: STATUS_OBJECTS, "/printer/objects/list": STATUS_LIST})
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.get("/api/control/status")).json() == {
        "state": "standby",
        "locked": False,
        "position": {"x": 120.0, "y": 110.0, "z": 24.4},
        "homed": "xyz",
        "heaters": [
            {"key": "extruder", "label": "Nozzle", "temperature": 205.3, "target": 210.0},
            {"key": "heater_bed", "label": "Bed", "temperature": 59.9, "target": 60.0},
        ],
        "speed_percent": 100,
        "flow_percent": 98,
        "z_offset": -0.12,
        "fans": [
            {"key": "", "label": "Part fan", "percent": 50},
            {"key": "aux", "label": "aux", "percent": 0},
        ],
    }
    queried = moonraker.asked[0][1]
    assert set(queried) == {
        "print_stats",
        "toolhead",
        "extruder",
        "heater_bed",
        "fan",
        "gcode_move",
        "fan_generic aux",
    }


async def test_the_status_says_locked_while_printing(client: AsyncClient, monkeypatch):
    printing = {"status": {**STATUS_OBJECTS["status"], "print_stats": {"state": "printing"}}}
    moonraker = FakeMoonraker({STATE_PATH: printing, "/printer/objects/list": STATUS_LIST})
    install_fakes(monkeypatch, moonraker=moonraker)
    body = (await client.get("/api/control/status")).json()
    assert (body["state"], body["locked"]) == ("printing", True)


async def test_the_status_is_a_502_when_the_printer_does_not_answer(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker({"/printer/objects/list": RuntimeError("offline")})
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.get("/api/control/status")
    assert (response.status_code, response.json()["detail"]) == (502, "offline")


async def test_a_named_fan_is_set_with_its_name(client: AsyncClient, monkeypatch):
    response, moonraker = await command(client, monkeypatch, "standby", "fan", {"percent": 40, "name": "aux"})
    assert response.status_code == 200
    assert scripts(moonraker) == ["SET_FAN_SPEED FAN=aux SPEED=0.4"]


async def test_a_fan_name_that_is_not_a_name_is_refused(client: AsyncClient, monkeypatch):
    response, moonraker = await command(client, monkeypatch, "standby", "fan", {"percent": 40, "name": "a b"})
    assert response.status_code == 422
    assert moonraker.posted == []
