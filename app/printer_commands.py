"""What the Control page may ask of the printer: the limits of each value and the G-code line it becomes."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Axis = Literal["x", "y", "z"]

LOCKED_STATES = frozenset({"printing", "paused"})
HEATER_LIMITS = {"extruder": 300, "heater_bed": 130}
MACRO_NAME_PATTERN = r"^[A-Za-z0-9_]+$"

CALIBRATION_STEPS = {
    "bed_mesh": "BED_MESH_CALIBRATE",
    "screws_tilt": "SCREWS_TILT_CALCULATE",
    "manual_probe": "MANUAL_PROBE",
    "accept": "ACCEPT",
    "abort": "ABORT",
}


def is_locked(state: str) -> bool:
    return state in LOCKED_STATES


def number(value: float) -> str:
    return f"{value:g}"


def refuse_zero(value: float) -> float:
    if value == 0:
        raise ValueError("must not be zero")
    return value


class MoveRequest(BaseModel):
    axis: Axis
    distance: float = Field(ge=-200, le=200)
    speed: int = Field(default=6000, ge=1, le=30000)

    _distance_moves = field_validator("distance")(refuse_zero)

    def script(self) -> str:
        return "\n".join(["G91", f"G1 {self.axis.upper()}{number(self.distance)} F{self.speed}", "G90"])


class HomeRequest(BaseModel):
    axes: list[Axis] = []

    def script(self) -> str:
        return " ".join(["G28", *(axis.upper() for axis in self.axes)])


class ExtrudeRequest(BaseModel):
    length: float = Field(ge=-100, le=100)
    speed: int = Field(default=300, ge=1, le=1200)

    _length_moves = field_validator("length")(refuse_zero)

    def script(self) -> str:
        return "\n".join(["M83", f"G1 E{number(self.length)} F{self.speed}"])


class TemperatureRequest(BaseModel):
    heater: Literal["extruder", "heater_bed"]
    target: float = Field(ge=0)

    @model_validator(mode="after")
    def stay_within_the_heater_limit(self) -> "TemperatureRequest":
        if self.target > HEATER_LIMITS[self.heater]:
            raise ValueError(
                f"The {HEATER_LABELS[self.heater].lower()} goes up to {HEATER_LIMITS[self.heater]} °C, not {number(self.target)} °C"
            )
        return self

    def script(self) -> str:
        return f"SET_HEATER_TEMPERATURE HEATER={self.heater} TARGET={number(self.target)}"


class SpeedRequest(BaseModel):
    percent: int = Field(ge=10, le=300)

    def script(self) -> str:
        return f"M220 S{self.percent}"


class FlowRequest(BaseModel):
    percent: int = Field(ge=50, le=200)

    def script(self) -> str:
        return f"M221 S{self.percent}"


class FanRequest(BaseModel):
    """The part fan when no name is given, otherwise the named fan."""

    percent: int = Field(ge=0, le=100)
    name: str | None = Field(default=None, pattern=MACRO_NAME_PATTERN)

    def script(self) -> str:
        if self.name:
            return f"SET_FAN_SPEED FAN={self.name} SPEED={number(self.percent / 100)}"
        return f"M106 S{round(self.percent * 255 / 100)}"


class BabystepRequest(BaseModel):
    offset: float = Field(ge=-1, le=1)

    def script(self) -> str:
        return f"SET_GCODE_OFFSET Z_ADJUST={number(self.offset)} MOVE=1"


class ProbeRequest(BaseModel):
    """A step of the probe that is moved by hand, while the printer calibrates."""

    direction: Literal["up", "down"]
    step: float = Field(gt=0, le=1)

    def script(self) -> str:
        sign = "+" if self.direction == "up" else "-"
        return f"TESTZ Z={sign}{number(self.step)}"


class MacroRequest(BaseModel):
    name: str = Field(pattern=MACRO_NAME_PATTERN)

    def script(self) -> str:
        return self.name


class GcodeRequest(BaseModel):
    script: str

    @field_validator("script")
    @classmethod
    def have_a_line(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be empty")
        return value.strip()


MACRO_PREFIX = "gcode_macro "
DEFAULT_MACRO_DESCRIPTION = "G-Code macro"
FLUIDD_NAMESPACE = "fluidd"
FLUIDD_MACROS_KEY = "macros"


def visible_macros(objects: list[str]) -> list[str]:
    names = [name.removeprefix(MACRO_PREFIX) for name in objects if name.startswith(MACRO_PREFIX)]
    return sorted(name for name in names if not name.startswith("_"))


def read_macro_description(name: str, settings: dict) -> str:
    description = settings.get(f"{MACRO_PREFIX}{name.lower()}", {}).get("description", "")
    return "" if description == DEFAULT_MACRO_DESCRIPTION else description


def describe_macros(objects: list[str], settings: dict, fluidd: dict) -> list[dict]:
    """The macros of the printer with their description and the category the person gave them in Fluidd.

    Fluidd keeps its categories in the Moonraker database, in the order the person put them. A macro it hides is left out,
    a macro it does not know about has no category and comes last.
    """
    category_names = {category["id"]: category["name"] for category in fluidd.get("categories", [])}
    category_order = {category["name"]: place for place, category in enumerate(fluidd.get("categories", []))}
    stored = {macro["name"].lower(): macro for macro in fluidd.get("stored", [])}
    macros = []
    for name in visible_macros(objects):
        known = stored.get(name.lower(), {})
        if known.get("visible") is False:
            continue
        category = category_names.get(known.get("categoryId"), "")
        macros.append({"name": name, "description": read_macro_description(name, settings), "category": category})
    return sorted(macros, key=lambda macro: category_order.get(macro["category"], len(category_order)))


HEATER_LABELS = {"extruder": "Nozzle", "heater_bed": "Bed"}
FAN_OBJECT_PREFIX = "fan_generic "


def list_fan_objects(objects: list[str]) -> list[str]:
    return sorted(name for name in objects if name.startswith(FAN_OBJECT_PREFIX))


def describe_heater(key: str, readings: dict) -> dict:
    return {
        "key": key,
        "label": HEATER_LABELS[key],
        "temperature": round(readings["temperature"], 1),
        "target": readings["target"],
    }


def describe_fans(status: dict, fan_objects: list[str]) -> list[dict]:
    fans = [{"key": "", "label": "Part fan", "percent": round(status["fan"]["speed"] * 100)}]
    for fan_object in fan_objects:
        name = fan_object.removeprefix(FAN_OBJECT_PREFIX)
        fans.append({"key": name, "label": name, "percent": round(status[fan_object]["speed"] * 100)})
    return fans


def describe_manual_probe(readings: dict) -> dict:
    return {"active": readings["is_active"], "z": readings["z_position"]}


def describe_status(status: dict, fan_objects: list[str]) -> dict:
    """What the cards of the Control page show, from the objects the printer reported."""
    state = status["print_stats"]["state"]
    x, y, z = status["toolhead"]["position"][:3]
    motion = status["gcode_move"]
    return {
        "state": state,
        "locked": is_locked(state),
        "position": {"x": x, "y": y, "z": z},
        "homed": status["toolhead"]["homed_axes"],
        "heaters": [describe_heater(key, status[key]) for key in HEATER_LABELS],
        "speed_percent": round(motion["speed_factor"] * 100),
        "flow_percent": round(motion["extrude_factor"] * 100),
        "z_offset": motion["homing_origin"][2],
        "manual_probe": describe_manual_probe(status["manual_probe"]),
        "fans": describe_fans(status, fan_objects),
    }
