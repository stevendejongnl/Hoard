from fastapi import APIRouter, Depends, HTTPException

from app.moonraker import MoonrakerClient
from app.printer_commands import (
    CALIBRATION_STEPS,
    BabystepRequest,
    ExtrudeRequest,
    FanRequest,
    FlowRequest,
    GcodeRequest,
    HomeRequest,
    MacroRequest,
    MoveRequest,
    ProbeRequest,
    SpeedRequest,
    TemperatureRequest,
    describe_status,
    is_locked,
    list_fan_objects,
    visible_macros,
)
from app.routes.dependencies import Moonraker

router = APIRouter(prefix="/api/control", tags=["control"])

OBJECTS_QUERY = "/printer/objects/query"
GCODE_SCRIPT = "/printer/gcode/script"


async def read_print_state(moonraker: MoonrakerClient) -> str:
    """The printer's print state; a printer that cannot say is a 502, so nothing moves on a guess."""
    try:
        answer = await moonraker.get(OBJECTS_QUERY, print_stats="")
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return answer["status"]["print_stats"]["state"]


async def require_idle_printer(moonraker: Moonraker) -> None:
    if is_locked(await read_print_state(moonraker)):
        raise HTTPException(409, "Locked while the printer is printing")


Idle = Depends(require_idle_printer)


async def run_script(moonraker: MoonrakerClient, script: str) -> dict:
    try:
        await moonraker.post(GCODE_SCRIPT, script=script)
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"ok": True}


@router.get("/lock")
async def lock_state(moonraker: Moonraker) -> dict:
    state = await read_print_state(moonraker)
    return {"locked": is_locked(state), "state": state}


STATUS_OBJECTS = ("print_stats", "toolhead", "extruder", "heater_bed", "fan", "gcode_move", "manual_probe")


@router.get("/status")
async def status(moonraker: Moonraker) -> dict:
    try:
        fan_objects = list_fan_objects((await moonraker.get("/printer/objects/list"))["objects"])
        queried = dict.fromkeys([*STATUS_OBJECTS, *fan_objects], "")
        answer = await moonraker.get(OBJECTS_QUERY, **queried)
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return describe_status(answer["status"], fan_objects)


@router.post("/move", dependencies=[Idle])
async def move(request: MoveRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/home", dependencies=[Idle])
async def home(request: HomeRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/extrude", dependencies=[Idle])
async def extrude(request: ExtrudeRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/temperature")
async def temperature(request: TemperatureRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/speed")
async def speed(request: SpeedRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/flow")
async def flow(request: FlowRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/fan")
async def fan(request: FanRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/babystep")
async def babystep(request: BabystepRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/macro", dependencies=[Idle])
async def macro(request: MacroRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/gcode", dependencies=[Idle])
async def gcode(request: GcodeRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script)


@router.post("/probe", dependencies=[Idle])
async def probe(request: ProbeRequest, moonraker: Moonraker) -> dict:
    return await run_script(moonraker, request.script())


@router.post("/calibrate/{step}", dependencies=[Idle])
async def calibrate(step: str, moonraker: Moonraker) -> dict:
    if step not in CALIBRATION_STEPS:
        raise HTTPException(404, "Calibration step not found")
    return await run_script(moonraker, CALIBRATION_STEPS[step])


@router.get("/macros")
async def macros(moonraker: Moonraker) -> list[str]:
    try:
        answer = await moonraker.get("/printer/objects/list")
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return visible_macros(answer["objects"])


CONSOLE_LINES = 100


@router.get("/console")
async def console(moonraker: Moonraker) -> list[dict]:
    try:
        answer = await moonraker.get("/server/gcode_store", count=CONSOLE_LINES)
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return answer["gcode_store"]


@router.get("/bed_mesh")
async def bed_mesh(moonraker: Moonraker) -> dict:
    try:
        answer = await moonraker.get(OBJECTS_QUERY, bed_mesh="")
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return answer["status"]["bed_mesh"]
