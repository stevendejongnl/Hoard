# GCode Metadata Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically extract and persist slicer metadata from gcode files into a dedicated `gcode_meta` column on `print_jobs`, surfacing it on the print detail page as a read-only "Slicer Info" section.

**Architecture:** A new `app/gcode_meta.py` module handles extraction — merging Moonraker's `/server/files/metadata` response with any `; meta:key=value` custom comments from the gcode header. Extraction is triggered at job completion (in `recorder.py`) and lazily on first detail view (in `routes/prints.py`). The frontend `PrintJob` type gains a `gcode_meta` field displayed as a read-only card on the print detail page.

**Tech Stack:** Python/FastAPI (backend), aiosqlite (DB migration), Lit/TypeScript (frontend), Moonraker API.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `app/gcode_meta.py` | **Create** | Extraction logic: Moonraker metadata + custom comment parser |
| `app/db.py` | **Modify** | Add `gcode_meta` column migration + deserialize in `get_or_create_print_job` + allow in `update_print_job` |
| `app/recorder.py` | **Modify** | Call `extract_and_store_gcode_meta` after job completion |
| `app/routes/prints.py` | **Modify** | Lazy extraction on `GET /api/prints/:job_id` if `gcode_meta` is None |
| `frontend/src/types.ts` | **Modify** | Add `GcodeMeta` interface + `gcode_meta` field to `PrintJob` |
| `frontend/src/pages/print-detail-page.ts` | **Modify** | Render read-only "Slicer Info" section |
| `tests/test_gcode_meta.py` | **Create** | Unit tests for extraction logic |

---

## Task 1: Create `app/gcode_meta.py`

**Files:**
- Create: `app/gcode_meta.py`
- Test: `tests/test_gcode_meta.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_gcode_meta.py`:

```python
import pytest
from app.gcode_meta import parse_custom_meta, map_moonraker_meta


def test_parse_custom_meta_basic():
    gcode = b"; meta:source_url=https://makerworld.com/models/123\n; meta:project_name=Benchy\nG28\n"
    result = parse_custom_meta(gcode)
    assert result == {"source_url": "https://makerworld.com/models/123", "project_name": "Benchy"}


def test_parse_custom_meta_empty():
    gcode = b"G28\nG1 X10 Y10\n"
    result = parse_custom_meta(gcode)
    assert result == {}


def test_parse_custom_meta_ignores_non_meta_comments():
    gcode = b"; FLAVOR:Marlin\n; TIME:3600\n; meta:source_url=https://example.com\n"
    result = parse_custom_meta(gcode)
    assert result == {"source_url": "https://example.com"}


def test_parse_custom_meta_skips_blank_values():
    gcode = b"; meta:source_url=\n; meta:project_name=Benchy\n"
    result = parse_custom_meta(gcode)
    assert result == {"project_name": "Benchy"}


def test_map_moonraker_meta_full():
    moonraker_data = {
        "layer_height": 0.2,
        "first_layer_height": 0.28,
        "filament_weight_total": 12.4,
        "estimated_time": 3600,
        "nozzle_diameter": [0.4],
        "filament_type": ["PLA"],
        "first_layer_extr_temp": 215,
        "first_layer_bed_temp": 60,
        "slicer": "Cura_SteamEngine",
        "slicer_version": "5.9.0",
        "layer_count": 120,
        "object_height": 24.0,
    }
    result = map_moonraker_meta(moonraker_data)
    assert result["layer_height"] == 0.2
    assert result["filament_weight_g"] == 12.4
    assert result["estimated_time_s"] == 3600
    assert result["nozzle_diameter"] == 0.4
    assert result["filament_type"] == "PLA"
    assert result["nozzle_temp"] == 215
    assert result["bed_temp"] == 60
    assert result["slicer"] == "Cura_SteamEngine"
    assert result["slicer_version"] == "5.9.0"
    assert result["layer_count"] == 120
    assert result["object_height"] == 24.0


def test_map_moonraker_meta_partial():
    result = map_moonraker_meta({"layer_height": 0.3})
    assert result == {"layer_height": 0.3}


def test_map_moonraker_meta_empty():
    result = map_moonraker_meta({})
    assert result == {}


def test_map_moonraker_meta_list_fields_single():
    result = map_moonraker_meta({"nozzle_diameter": [0.6], "filament_type": ["PETG"]})
    assert result["nozzle_diameter"] == 0.6
    assert result["filament_type"] == "PETG"


def test_map_moonraker_meta_list_fields_multi():
    result = map_moonraker_meta({"filament_type": ["PLA", "PLA"]})
    assert result["filament_type"] == "PLA"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/stevendejong/workspace/personal/3d-printing/printer
uv run pytest tests/test_gcode_meta.py -v
```

Expected: `ModuleNotFoundError` or `ImportError` — `app/gcode_meta` doesn't exist yet.

- [ ] **Step 3: Implement `app/gcode_meta.py`**

Create `app/gcode_meta.py`:

```python
import logging
import re
from typing import Any

log = logging.getLogger(__name__)


def parse_custom_meta(gcode_bytes: bytes) -> dict[str, str]:
    """Parse '; meta:key=value' lines from gcode header (first 64 KB).

    Returns a dict of key → value strings. Skips blank values.
    """
    header = gcode_bytes[:65536].decode("ascii", errors="ignore")
    result: dict[str, str] = {}
    for line in header.splitlines():
        m = re.match(r";\s*meta:([A-Za-z0-9_]+)=(.+)", line)
        if m:
            key = m.group(1).strip()
            value = m.group(2).strip()
            if value:
                result[key] = value
    return result


def map_moonraker_meta(data: dict[str, Any]) -> dict[str, Any]:
    """Map Moonraker /server/files/metadata response to normalized gcode_meta fields.

    Only includes keys that are present and non-None in the response.
    """
    result: dict[str, Any] = {}

    scalar_map = {
        "layer_height": "layer_height",
        "first_layer_height": "first_layer_height",
        "filament_weight_total": "filament_weight_g",
        "estimated_time": "estimated_time_s",
        "first_layer_extr_temp": "nozzle_temp",
        "first_layer_bed_temp": "bed_temp",
        "slicer": "slicer",
        "slicer_version": "slicer_version",
        "layer_count": "layer_count",
        "object_height": "object_height",
    }
    for src, dst in scalar_map.items():
        val = data.get(src)
        if val is not None:
            result[dst] = val

    # List fields — take first unique value
    for src, dst in [("nozzle_diameter", "nozzle_diameter"), ("filament_type", "filament_type")]:
        val = data.get(src)
        if isinstance(val, list) and val:
            result[dst] = val[0]
        elif val is not None:
            result[dst] = val

    return result


async def extract_gcode_meta(filename: str) -> dict[str, Any]:
    """Extract gcode metadata for a file.

    Merges Moonraker's parsed metadata with any '; meta:key=value' custom comments.
    Returns empty dict if both sources fail.
    """
    from app.moonraker import moonraker

    meta: dict[str, Any] = {}

    try:
        moonraker_data = await moonraker.get_file_metadata(filename)
        meta.update(map_moonraker_meta(moonraker_data))
    except Exception as exc:
        log.debug("gcode_meta: moonraker metadata failed for %s: %s", filename, exc)

    try:
        gcode_bytes = await moonraker.download_file_partial(filename, size=65536)
        custom = parse_custom_meta(gcode_bytes)
        meta.update(custom)
    except Exception as exc:
        log.debug("gcode_meta: custom comment parse failed for %s: %s", filename, exc)

    return meta
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_gcode_meta.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/gcode_meta.py tests/test_gcode_meta.py
git commit -m "feat: add gcode metadata extraction module"
```

---

## Task 2: DB migration — add `gcode_meta` column

**Files:**
- Modify: `app/db.py`

- [ ] **Step 1: Add migration in `init_db`**

In `app/db.py`, find the block that adds migration columns with `ALTER TABLE ... ADD COLUMN` (around the `project_links` meta column section). Add this after the existing `print_jobs` table creation (after the `print_photos` table creation and `await db.commit()`):

```python
        # gcode_meta column — stores slicer-extracted metadata as JSON
        try:
            await db.execute("ALTER TABLE print_jobs ADD COLUMN gcode_meta TEXT")
        except Exception:
            pass  # column already exists
        await db.commit()
```

- [ ] **Step 2: Deserialize `gcode_meta` in `get_or_create_print_job`**

In `get_or_create_print_job`, find the deserialization loop:

```python
    for field, default in (("tags", []), ("settings", None)):
        raw = result.get(field)
        if raw is not None:
            try:
                result[field] = _json.loads(raw)
            except Exception:
                result[field] = default
        else:
            result[field] = default
```

Change it to:

```python
    for field, default in (("tags", []), ("settings", None), ("gcode_meta", None)):
        raw = result.get(field)
        if raw is not None:
            try:
                result[field] = _json.loads(raw)
            except Exception:
                result[field] = default
        else:
            result[field] = default
```

- [ ] **Step 3: Allow `gcode_meta` in `update_print_job`**

In `update_print_job`, find:

```python
    allowed = {k: v for k, v in data.items() if k in ("notes", "settings", "tags")}
```

Change to:

```python
    allowed = {k: v for k, v in data.items() if k in ("notes", "settings", "tags", "gcode_meta")}
```

- [ ] **Step 4: Run existing tests to verify nothing broke**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db.py
git commit -m "feat: add gcode_meta column to print_jobs"
```

---

## Task 3: Trigger extraction at job completion in `recorder.py`

**Files:**
- Modify: `app/recorder.py`

- [ ] **Step 1: Add extraction call at end of `_record_print`**

In `app/recorder.py`, at the top of the file, the import block already imports `from app import db`. Add the gcode_meta import:

After the line `from app import db, ha`, add to the imports (keep alphabetical within the `app` block):

```python
from app.gcode_meta import extract_gcode_meta
```

- [ ] **Step 2: Call extraction after `link_print_spool`**

In `_record_print`, find:

```python
    await db.link_print_spool(job_id, spool_id, filament_g)
    # Keep project_prints stats in sync so projects auto-update without manual refresh
    await db.refresh_project_prints_stats(job_id, duration_s, filament_g, cost_total)
    await hub.broadcast("history_updated", {"job_id": job_id, "filename": filename})
```

Change to:

```python
    await db.link_print_spool(job_id, spool_id, filament_g)
    # Keep project_prints stats in sync so projects auto-update without manual refresh
    await db.refresh_project_prints_stats(job_id, duration_s, filament_g, cost_total)

    # Extract and store gcode metadata while file is still on printer
    try:
        gcode_meta = await extract_gcode_meta(filename)
        if gcode_meta:
            import json as _json
            await db.update_print_job(job_id, {"gcode_meta": _json.dumps(gcode_meta)})
            log.info("recorder: stored gcode_meta for %s (%d fields)", filename, len(gcode_meta))
    except Exception as exc:
        log.warning("recorder: gcode_meta extraction failed for %s: %s", filename, exc)

    await hub.broadcast("history_updated", {"job_id": job_id, "filename": filename})
```

- [ ] **Step 3: Run tests**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/recorder.py
git commit -m "feat: extract gcode metadata at job completion"
```

---

## Task 4: Lazy extraction on first print detail view

**Files:**
- Modify: `app/routes/prints.py`

- [ ] **Step 1: Add lazy extraction to `get_print_detail`**

In `app/routes/prints.py`, add the import at the top (after existing imports):

```python
from app.gcode_meta import extract_gcode_meta
```

Then find the `get_print_detail` endpoint:

```python
@router.get("/api/prints/{job_id}")
async def get_print_detail(job_id: str) -> dict[str, Any]:
    job_row = await db.get_or_create_print_job(job_id)
    stats = await _get_job_stats(job_id)
    photos = await db.list_print_photos(job_id)
    return {**stats, **job_row, "photos": photos}
```

Change to:

```python
@router.get("/api/prints/{job_id}")
async def get_print_detail(job_id: str) -> dict[str, Any]:
    import json as _json

    job_row = await db.get_or_create_print_job(job_id)

    # Lazy extraction for prints that completed before this feature shipped
    if job_row.get("gcode_meta") is None and job_row.get("filename") or True:
        filename = job_row.get("filename") or ""
        # filename may come from stats; re-fetch from moonraker via stats
        if not filename:
            try:
                job_data = await moonraker.get("/server/history/job", uid=job_id)
                filename = job_data.get("job", {}).get("filename", "")
            except Exception:
                pass
        if filename:
            try:
                gcode_meta = await extract_gcode_meta(filename)
                if gcode_meta:
                    await db.update_print_job(job_id, {"gcode_meta": _json.dumps(gcode_meta)})
                    job_row["gcode_meta"] = gcode_meta
            except Exception as exc:
                log.debug("prints: lazy gcode_meta failed for %s: %s", job_id, exc)

    stats = await _get_job_stats(job_id)
    photos = await db.list_print_photos(job_id)
    return {**stats, **job_row, "photos": photos}
```

Wait — this will re-extract on every request, not just when `gcode_meta` is None. Fix the condition:

```python
@router.get("/api/prints/{job_id}")
async def get_print_detail(job_id: str) -> dict[str, Any]:
    import json as _json

    job_row = await db.get_or_create_print_job(job_id)

    # Lazy extraction for prints that completed before this feature shipped
    if job_row.get("gcode_meta") is None:
        filename = ""
        try:
            job_data = await moonraker.get("/server/history/job", uid=job_id)
            filename = job_data.get("job", {}).get("filename", "")
        except Exception:
            pass
        if filename:
            try:
                gcode_meta = await extract_gcode_meta(filename)
                if gcode_meta:
                    await db.update_print_job(job_id, {"gcode_meta": _json.dumps(gcode_meta)})
                    job_row["gcode_meta"] = gcode_meta
            except Exception as exc:
                log.debug("prints: lazy gcode_meta failed for %s: %s", job_id, exc)

    stats = await _get_job_stats(job_id)
    photos = await db.list_print_photos(job_id)
    return {**stats, **job_row, "photos": photos}
```

- [ ] **Step 2: Run tests**

```bash
uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add app/routes/prints.py
git commit -m "feat: lazy gcode metadata extraction on first print detail view"
```

---

## Task 5: Frontend — types and print detail UI

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/pages/print-detail-page.ts`

- [ ] **Step 1: Add `GcodeMeta` interface and update `PrintJob` in `types.ts`**

In `frontend/src/types.ts`, at the end of the file (after the `PrintJob` interface), add:

```typescript
export interface GcodeMeta {
  layer_height?: number
  first_layer_height?: number
  filament_weight_g?: number
  estimated_time_s?: number
  nozzle_diameter?: number
  filament_type?: string
  nozzle_temp?: number
  bed_temp?: number
  slicer?: string
  slicer_version?: string
  layer_count?: number
  object_height?: number
  // custom '; meta:' comment fields
  source_url?: string
  project_name?: string
  [key: string]: string | number | undefined
}
```

Then in the `PrintJob` interface, add after `spool?: SpoolRef | null`:

```typescript
  gcode_meta?: GcodeMeta | null
```

- [ ] **Step 2: Add "Slicer Info" section to print detail page**

In `frontend/src/pages/print-detail-page.ts`, find the render method. Locate where the `print-settings-editor` component is rendered (the user-editable settings section). Add a `_renderGcodeMeta` method and call it just before the settings editor.

Add this helper method to the `PrintDetailPage` class (before the `render()` method):

```typescript
  private _renderGcodeMeta() {
    const meta = this.job?.gcode_meta
    if (!meta || Object.keys(meta).length === 0) return html``

    const labelMap: Record<string, string> = {
      layer_height: 'Layer height',
      first_layer_height: 'First layer',
      filament_weight_g: 'Filament weight',
      estimated_time_s: 'Estimated time',
      nozzle_diameter: 'Nozzle',
      filament_type: 'Filament type',
      nozzle_temp: 'Nozzle temp',
      bed_temp: 'Bed temp',
      slicer: 'Slicer',
      slicer_version: 'Slicer version',
      layer_count: 'Layers',
      object_height: 'Object height',
      source_url: 'Source',
      project_name: 'Project',
    }

    const formatValue = (key: string, val: string | number): string => {
      if (key === 'layer_height' || key === 'first_layer_height' || key === 'nozzle_diameter')
        return `${val} mm`
      if (key === 'filament_weight_g') return `${val} g`
      if (key === 'estimated_time_s') {
        const s = Number(val)
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        return h > 0 ? `${h}h ${m}m` : `${m}m`
      }
      if (key === 'nozzle_temp' || key === 'bed_temp') return `${val}°C`
      if (key === 'object_height') return `${val} mm`
      return String(val)
    }

    const entries = Object.entries(meta).filter(([, v]) => v != null && v !== '')

    return html`
      <div class="ppd-section">
        <div class="ppd-section-title">Slicer Info</div>
        <div class="ppd-meta-grid">
          ${entries.map(([key, val]) => {
            const label = labelMap[key] ?? key.replace(/_/g, ' ')
            const display = formatValue(key, val as string | number)
            if (key === 'source_url') {
              return html`<div class="ppd-meta-item"><span class="ppd-meta-label">${label}</span><a href="${display}" target="_blank" rel="noopener" class="ppd-meta-value ppd-meta-link">${display}</a></div>`
            }
            return html`<div class="ppd-meta-item"><span class="ppd-meta-label">${label}</span><span class="ppd-meta-value">${display}</span></div>`
          })}
        </div>
      </div>
    `
  }
```

- [ ] **Step 3: Add CSS for the new section and call `_renderGcodeMeta`**

In the same file, find the `styles` html template block at the top. Add these styles inside the `<style>` tag (after existing rules):

```css
  .ppd-section {
    background: var(--surface);
    border-radius: 8px;
    padding: 16px;
    border: 1px solid var(--border);
  }
  .ppd-section-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 12px;
  }
  .ppd-meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .ppd-meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ppd-meta-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ppd-meta-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }
  .ppd-meta-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ppd-meta-link:hover {
    text-decoration: underline;
  }
```

Then in the `render()` method, find where the print-settings-editor component is rendered. Add `${this._renderGcodeMeta()}` just before it. Look for this pattern and wrap it:

```typescript
        ${this._renderGcodeMeta()}
```

Place it just above the line that renders `<print-settings-editor>`.

- [ ] **Step 4: Build frontend**

```bash
cd /home/stevendejong/workspace/personal/3d-printing/printer/frontend
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /home/stevendejong/workspace/personal/3d-printing/printer
git add frontend/src/types.ts frontend/src/pages/print-detail-page.ts frontend/dist/
git commit -m "feat: display gcode metadata on print detail page"
```

---

## Task 6: Document Cura Start G-code setup

**Files:**
- Modify: `docs/superpowers/specs/2026-06-06-gcode-metadata-design.md` (create this file)

- [ ] **Step 1: Write the spec with Cura setup instructions**

Create `docs/superpowers/specs/2026-06-06-gcode-metadata-design.md`:

```markdown
# GCode Metadata — Design Spec

**Date:** 2026-06-06
**Status:** Implemented

## Summary

Slicer metadata from gcode files is automatically extracted and stored per-print.
Moonraker's `/server/files/metadata` provides slicer settings; custom `; meta:` comments
in Cura's Start G-code provide fields Moonraker can't know (source URL, project name).

## Cura Start G-code Setup

In Cura: **Preferences → Printers → Machine Settings → Start G-code**

Add these lines at the very top (before any movement commands):

```gcode
; meta:source_url={source_url}
; meta:project_name={print_name}
```

`{source_url}` and `{print_name}` are Cura placeholder variables — Cura substitutes the
actual profile values when slicing. Leave them blank if not applicable; blank values are
skipped during parsing.

Other fields (layer height, temps, filament type, nozzle diameter, etc.) are populated
automatically from Moonraker's metadata — no Start G-code configuration needed.

## Extracted Fields

| Field | Source |
|-------|--------|
| `layer_height` | Moonraker |
| `first_layer_height` | Moonraker |
| `filament_weight_g` | Moonraker |
| `estimated_time_s` | Moonraker |
| `nozzle_diameter` | Moonraker |
| `filament_type` | Moonraker |
| `nozzle_temp` | Moonraker |
| `bed_temp` | Moonraker |
| `slicer` | Moonraker |
| `slicer_version` | Moonraker |
| `layer_count` | Moonraker |
| `object_height` | Moonraker |
| `source_url` | Custom `;meta:` comment |
| `project_name` | Custom `;meta:` comment |

## Storage

`gcode_meta TEXT` column on `print_jobs` table — JSON, read-only, never overwritten
by user edits (that's `settings`). Populated at job completion and lazily on first
detail page view.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-06-gcode-metadata-design.md
git commit -m "docs: add gcode metadata design spec with Cura setup instructions"
```

---

## Self-Review Notes

- All 4 metadata categories are covered: slicer settings (Moonraker), material info (filament_type + Moonraker), model info (source_url + project_name via custom comments), print estimates (estimated_time_s, filament_weight_g).
- Extraction triggers: ✅ job completion (recorder.py), ✅ lazy on first view (routes/prints.py).
- DB: ✅ migration in init_db, ✅ deserialization in get_or_create_print_job, ✅ allowed in update_print_job.
- Frontend: ✅ GcodeMeta type, ✅ PrintJob.gcode_meta field, ✅ Slicer Info section on detail page.
- No placeholders — all code shown in full.
