from fastapi import APIRouter, Depends, HTTPException

from app.config_save import CONFIGFILE_ATTRIBUTES, SAVE_CONFIG_SCRIPT, describe_pending_changes
from app.moonraker import MoonrakerClient
from app.printer_commands import (
    CALIBRATION_STEPS,
    FLUIDD_MACROS_KEY,
    FLUIDD_NAMESPACE,
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
    describe_macros,
    describe_status,
    is_locked,
    list_fan_objects,
)
from app.probe_offset import find_probe_offset
from app.routes.dependencies import Moonraker, PrinterPowerControl
from app.routes.printer_failure import explain_failure

router = APIRouter(prefix="/api/control", tags=["control"])

OBJECTS_QUERY = "/printer/objects/query"
GCODE_SCRIPT = "/printer/gcode/script"


async def read_print_state(moonraker: MoonrakerClient) -> str:
    """The printer's print state; a printer that cannot say is a 502, so nothing moves on a guess."""
    try:
        answer = await moonraker.get(OBJECTS_QUERY, print_stats="")
    except Exception as exc:
        raise await explain_failure(moonraker, exc) from exc
    return answer["status"]["print_stats"]["state"]


async def require_idle_printer(moonraker: Moonraker) -> None:
    if is_locked(await read_print_state(moonraker)):
        raise HTTPException(409, "Locked while the printer is printing")


Idle = Depends(require_idle_printer)


async def run_script(moonraker: MoonrakerClient, script: str) -> dict:
    try:
        await moonraker.post(GCODE_SCRIPT, script=script)
    except Exception as exc:
        raise await explain_failure(moonraker, exc) from exc
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
        raise await explain_failure(moonraker, exc) from exc
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


async def read_config_file(moonraker: MoonrakerClient) -> dict:
    try:
        answer = await moonraker.get(OBJECTS_QUERY, configfile=CONFIGFILE_ATTRIBUTES)
    except Exception as exc:
        raise await explain_failure(moonraker, exc) from exc
    return answer["status"]["configfile"]


@router.get("/config/pending")
async def pending_config_changes(moonraker: Moonraker) -> dict:
    return describe_pending_changes(await read_config_file(moonraker))


@router.get("/probe_offset")
async def probe_offset(moonraker: Moonraker) -> dict:
    """The z_offset of the probe in the printer's config, not the temporary offset of a babystep."""
    return find_probe_offset((await read_config_file(moonraker)).get("settings", {}))


@router.post("/config/save", dependencies=[Idle])
async def save_config(moonraker: Moonraker, printer_power: PrinterPowerControl) -> dict:
    """Writes the pending changes to the printer's config. Klipper restarts, and Hoard expects that."""
    if not describe_pending_changes(await read_config_file(moonraker))["pending"]:
        raise HTTPException(409, "Nothing is waiting to be saved")
    answer = await run_script(moonraker, SAVE_CONFIG_SCRIPT)
    printer_power.note_expected_restart()
    return answer


async def read_optional(moonraker: Moonraker, path: str, **params: str) -> dict:
    """What the printer says about something that only decorates a list: nothing, when it cannot say."""
    try:
        return await moonraker.get(path, **params)
    except Exception:
        return {}


@router.get("/macros")
async def macros(moonraker: Moonraker) -> list[dict]:
    try:
        answer = await moonraker.get("/printer/objects/list")
    except Exception as exc:
        raise await explain_failure(moonraker, exc) from exc
    config = await read_optional(moonraker, OBJECTS_QUERY, configfile="settings")
    fluidd = await read_optional(moonraker, "/server/database/item", namespace=FLUIDD_NAMESPACE, key=FLUIDD_MACROS_KEY)
    settings = config.get("status", {}).get("configfile", {}).get("settings", {})
    return describe_macros(answer["objects"], settings, fluidd.get("value", {}))


CONSOLE_LINES = 300


@router.get("/console")
async def console(moonraker: Moonraker) -> list[dict]:
    try:
        answer = await moonraker.get("/server/gcode_store", count=CONSOLE_LINES)
    except Exception as exc:
        raise await explain_failure(moonraker, exc) from exc
    return answer["gcode_store"]


@router.get("/bed_mesh")
async def bed_mesh(moonraker: Moonraker) -> dict:
    try:
        answer = await moonraker.get(OBJECTS_QUERY, bed_mesh="")
    except Exception as exc:
        raise await explain_failure(moonraker, exc) from exc
    return answer["status"]["bed_mesh"]
