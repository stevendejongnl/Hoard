import pytest
from PIL import Image

from frontend.parity.image_comparison import (
    calculate_difference_share,
    create_difference_image,
    is_within_tolerance,
)

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 0, 0)
CHANNEL_TOLERANCE = 24


def create_solid_image(color: tuple[int, int, int], size: tuple[int, int] = (10, 10)) -> Image.Image:
    return Image.new("RGB", size, color)


def create_image_with_one_different_pixel() -> Image.Image:
    image = create_solid_image(BLACK)
    image.putpixel((3, 4), WHITE)
    return image


def test_identical_images_do_not_differ():
    share = calculate_difference_share(create_solid_image(BLACK), create_solid_image(BLACK), CHANNEL_TOLERANCE)
    assert share == 0.0


def test_completely_different_images_differ_everywhere():
    share = calculate_difference_share(create_solid_image(BLACK), create_solid_image(WHITE), CHANNEL_TOLERANCE)
    assert share == 1.0


def test_one_different_pixel_in_a_hundred_is_one_percent():
    share = calculate_difference_share(
        create_solid_image(BLACK), create_image_with_one_different_pixel(), CHANNEL_TOLERANCE
    )
    assert share == pytest.approx(0.01)


def test_channel_differences_within_the_tolerance_are_ignored():
    share = calculate_difference_share(
        create_solid_image((100, 100, 100)), create_solid_image((110, 100, 100)), CHANNEL_TOLERANCE
    )
    assert share == 0.0


def test_channel_differences_above_the_tolerance_count():
    share = calculate_difference_share(
        create_solid_image((100, 100, 100)), create_solid_image((140, 100, 100)), CHANNEL_TOLERANCE
    )
    assert share == 1.0


def test_images_of_different_sizes_cannot_be_compared():
    with pytest.raises(ValueError):
        calculate_difference_share(create_solid_image(BLACK, (10, 10)), create_solid_image(BLACK, (10, 11)), 0)


def test_difference_image_keeps_the_size_of_the_screenshot():
    difference_image = create_difference_image(
        create_solid_image(BLACK, (8, 6)), create_solid_image(BLACK, (8, 6)), CHANNEL_TOLERANCE
    )
    assert difference_image.size == (8, 6)


def test_difference_image_marks_differing_pixels_in_red():
    difference_image = create_difference_image(
        create_solid_image(BLACK), create_image_with_one_different_pixel(), CHANNEL_TOLERANCE
    )
    assert difference_image.convert("RGB").getpixel((3, 4)) == RED


def test_difference_image_dims_pixels_that_match():
    difference_image = create_difference_image(
        create_solid_image(WHITE), create_solid_image(WHITE), CHANNEL_TOLERANCE
    )
    assert difference_image.convert("RGB").getpixel((0, 0)) != WHITE


@pytest.mark.parametrize(
    ("difference_share", "maximum_share", "expected"),
    [(0.0, 0.005, True), (0.005, 0.005, True), (0.0051, 0.005, False), (1.0, 0.005, False)],
)
def test_is_within_tolerance(difference_share, maximum_share, expected):
    assert is_within_tolerance(difference_share, maximum_share) is expected
