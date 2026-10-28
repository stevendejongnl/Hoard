# Pixel parity with the design

Every screen of the app is compared with a reference image rendered from the design.
The comparison is the test for pixel parity: a screen is done when it is within the tolerance.

## Run it

From `frontend/`:

| Command | What it does |
|---|---|
| `npm run parity` | Starts the mock backend and the dev server, screenshots every screen at the design size, and prints how far each is from its reference. Exit code 1 if any screen is outside the tolerance. |
| `npm run parity -- --only dashboard-desktop history-phone` | The same for some screens. |
| `npm run parity:tests` | Unit tests of the comparison and the mock backend. |
| `npm run parity:references -- --runtime <path>` | Renders the reference images again from `design/`. Needs the design runtime script (it belongs to the design tool and is not stored here). |

Screenshots and difference images (differing pixels in red) are written to `output/`, which is git-ignored.

Requires Python 3 with Playwright (and its Chromium) and Pillow.

## Tolerance

A pixel differs when any color channel is more than 24 apart, which is above the anti-aliasing noise between
two renders of the same screen. A screen passes only when no pixel differs, so a layout shift of one pixel
fails. Both numbers are set once in `image_comparison.py`.

## Conditions

The references and the screenshots are taken under the same conditions (`browser_settings.py`): 1360x860 and
390x844 viewports, English (UK) locale, UTC, a fixed clock (14:56, so a print with 3h27m left finishes at
18:23), dark color scheme, no animations, and the same Barlow and JetBrains Mono font files.

## Files

- `design/`: the design artboards (`.dc.html`), the source of the references.
- `references/`: the rendered reference images.
- `fixture_data.py`: the data the design shows, in the shapes the API returns.
- `mock_backend.py`: serves that data as JSON and as a server-sent events stream.
- `image_comparison.py`: counts and marks differing pixels.
- `compare_screens.py`: runs the whole comparison.
