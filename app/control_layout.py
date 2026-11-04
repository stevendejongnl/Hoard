"""The layout of the Control page: which cards show, in what order, and how many columns each one spans."""

from pydantic import BaseModel, model_validator

CARD_KEYS = (
    "camera",
    "move",
    "temperatures",
    "extruder",
    "tuning",
    "bed_mesh",
    "calibration",
    "macros",
    "console",
)
DEVICES = ("desktop", "phone")
MAX_SPAN = 3


def find_repeated(keys: list[str]) -> bool:
    return len(set(keys)) != len(keys)


def find_unknown(keys: list[str]) -> list[str]:
    return [key for key in keys if key not in CARD_KEYS]


class ControlLayout(BaseModel):
    """Cards missing from `order` are put after the others by the page, so a new card is never lost."""

    order: list[str] = []
    spans: dict[str, int] = {}
    hidden: list[str] = []

    @model_validator(mode="after")
    def make_sense(self) -> "ControlLayout":
        keys = [*self.order, *self.spans, *self.hidden]
        if find_unknown(keys):
            raise ValueError(f"Unknown card: {find_unknown(keys)[0]}")
        if find_repeated(self.order) or find_repeated(self.hidden):
            raise ValueError("A card is named twice")
        if set(self.order) & set(self.hidden):
            raise ValueError("A card cannot be both shown and hidden")
        if any(not 1 <= span <= MAX_SPAN for span in self.spans.values()):
            raise ValueError(f"A card spans 1 to {MAX_SPAN} columns")
        return self
