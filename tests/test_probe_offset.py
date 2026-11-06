from app.probe_offset import find_probe_offset


def test_the_offset_of_a_bltouch_is_found_in_its_section():
    settings = {"bltouch": {"z_offset": -2.35}, "stepper_z": {"position_endstop": 0.0}}
    assert find_probe_offset(settings) == {"section": "bltouch", "z_offset": "-2.35"}


def test_the_offset_of_a_plain_probe_is_found_too():
    assert find_probe_offset({"probe": {"z_offset": 1.2}}) == {"section": "probe", "z_offset": "1.2"}


def test_a_printer_without_a_probe_has_no_offset():
    assert find_probe_offset({"stepper_z": {}}) == {"section": None, "z_offset": None}


def test_a_probe_section_without_an_offset_has_no_offset():
    assert find_probe_offset({"bltouch": {"sensor_pin": "PB1"}}) == {"section": "bltouch", "z_offset": None}
