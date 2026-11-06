from app.config_save import describe_pending_changes


def configfile(pending_items: dict, settings: dict | None = None, pending: bool = True) -> dict:
    return {"save_config_pending": pending, "save_config_pending_items": pending_items, "settings": settings or {}}


def test_nothing_waiting_is_reported_as_no_changes():
    assert describe_pending_changes(configfile({}, pending=False)) == {"pending": False, "changes": []}


def test_a_changed_value_shows_the_value_the_printer_runs_with_and_the_new_one():
    answer = describe_pending_changes(configfile({"bltouch": {"z_offset": "-2.400"}}, {"bltouch": {"z_offset": -2.35}}))
    assert answer == {
        "pending": True,
        "changes": [{"section": "bltouch", "key": "z_offset", "old": "-2.35", "new": "-2.400"}],
    }


def test_a_value_the_printer_does_not_have_yet_has_no_old_value():
    answer = describe_pending_changes(configfile({"bed_mesh default": {"version": "1"}}))
    assert answer["changes"] == [{"section": "bed_mesh default", "key": "version", "old": None, "new": "1"}]


def test_the_section_of_the_settings_is_found_whatever_its_case():
    answer = describe_pending_changes(configfile({"BLTouch": {"z_offset": "-2.4"}}, {"bltouch": {"z_offset": -2.35}}))
    assert answer["changes"][0]["old"] == "-2.35"


def test_changes_are_listed_by_section_and_key():
    items = {"stepper_z": {"position_endstop": "0.1"}, "bltouch": {"z_offset": "-2.4", "activate_gcode": "x"}}
    keys = [(change["section"], change["key"]) for change in describe_pending_changes(configfile(items))["changes"]]
    assert keys == [("bltouch", "activate_gcode"), ("bltouch", "z_offset"), ("stepper_z", "position_endstop")]


def test_pending_changes_that_klipper_does_not_list_still_count_as_waiting():
    assert describe_pending_changes(configfile({}, pending=True)) == {"pending": True, "changes": []}
