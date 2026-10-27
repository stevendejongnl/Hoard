"""Compare a screenshot with its reference image for the pixel parity checks.

Font anti-aliasing differs a little between renderers, so a pixel only counts as different when one
of its color channels differs by more than a tolerance, and a screen passes while the share of
differing pixels stays under a maximum. Both numbers are set here once.
"""

from PIL import Image, ImageChops

# A pixel differs when any color channel is further apart than this (0 to 255).
DEFAULT_CHANNEL_TOLERANCE = 24
# A screen passes while at most this share of its pixels differs.
MAXIMUM_DIFFERENCE_SHARE = 0.005

DIFFERENCE_COLOR = (255, 0, 0)
MATCHING_PIXEL_BRIGHTNESS = 0.35
MASK_DIFFERENT = 255


def ensure_same_size(reference_image: Image.Image, screenshot_image: Image.Image) -> None:
    if reference_image.size == screenshot_image.size:
        return
    raise ValueError(f"Images differ in size: reference {reference_image.size}, screenshot {screenshot_image.size}")


def mark_channel_above_tolerance(channel: Image.Image, channel_tolerance: int) -> Image.Image:
    return channel.point(lambda value: MASK_DIFFERENT if value > channel_tolerance else 0)


def find_differing_pixel_mask(
    reference_image: Image.Image, screenshot_image: Image.Image, channel_tolerance: int
) -> Image.Image:
    """Returns a mask that is 255 where any color channel differs by more than the tolerance."""
    ensure_same_size(reference_image, screenshot_image)
    difference = ImageChops.difference(reference_image.convert("RGB"), screenshot_image.convert("RGB"))
    red_mask, green_mask, blue_mask = (mark_channel_above_tolerance(c, channel_tolerance) for c in difference.split())
    return ImageChops.lighter(ImageChops.lighter(red_mask, green_mask), blue_mask)


def calculate_difference_share(
    reference_image: Image.Image, screenshot_image: Image.Image, channel_tolerance: int
) -> float:
    """Returns the share of pixels, from 0 to 1, that differ more than the tolerance."""
    mask = find_differing_pixel_mask(reference_image, screenshot_image, channel_tolerance)
    differing_pixel_count = mask.histogram()[MASK_DIFFERENT]
    return differing_pixel_count / (mask.width * mask.height)


def create_difference_image(
    reference_image: Image.Image, screenshot_image: Image.Image, channel_tolerance: int
) -> Image.Image:
    """Returns the screenshot dimmed, with every differing pixel painted red."""
    mask = find_differing_pixel_mask(reference_image, screenshot_image, channel_tolerance)
    screenshot = screenshot_image.convert("RGB")
    black = Image.new("RGB", screenshot.size, (0, 0, 0))
    dimmed_screenshot = Image.blend(black, screenshot, MATCHING_PIXEL_BRIGHTNESS)
    dimmed_screenshot.paste(Image.new("RGB", screenshot.size, DIFFERENCE_COLOR), mask=mask)
    return dimmed_screenshot


def is_within_tolerance(difference_share: float, maximum_share: float) -> bool:
    return difference_share <= maximum_share
