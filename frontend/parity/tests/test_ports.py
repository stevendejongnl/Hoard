import pytest

from frontend.parity.ports import read_port


def test_uses_the_default_when_the_variable_is_not_set():
    assert read_port({}, "PARITY_APP_PORT", 5199) == 5199


def test_uses_the_value_of_the_variable():
    assert read_port({"PARITY_APP_PORT": "6200"}, "PARITY_APP_PORT", 5199) == 6200


def test_uses_the_default_for_an_empty_variable():
    assert read_port({"PARITY_APP_PORT": ""}, "PARITY_APP_PORT", 5199) == 5199


@pytest.mark.parametrize("text", ["abc", "12.5", "0", "-1", "70000"])
def test_refuses_a_value_that_is_not_a_port(text):
    with pytest.raises(ValueError):
        read_port({"PARITY_APP_PORT": text}, "PARITY_APP_PORT", 5199)
