# Print Detail Pages — Design Spec

**Date:** 2026-06-06
**Status:** Approved

## Summary

Add a dedicated detail page for each Klipper print job (`/prints/:job_id`). Every print in history gets a canonical, deep-linkable page showing its stats, spool info, editable print settings, notes, tags, and a photo gallery (webcam auto-snapshot + manual uploads). History is the logbook — projects remain groupings on top.

---

## Goals

- Per-print-job detail page at `/prints/:job_id`
- Editable: notes (markdown), print settings (8 fields), tags (free-form)
- Photos: webcam auto-snapshot on completion + manual upload, thumbnail gallery
- Deep links from history page rows and from project detail print lists
- Data-first layout consistent with existing project detail page

---

## Data Model

### New table: `print_jobs`

One row per Klipper `job_id`. Created on first access (get-or-create).

```sql
CREATE TABLE IF NOT EXISTS print_jobs (
    job_id      TEXT PRIMARY KEY,
    notes       TEXT,
    settings    TEXT,   -- JSON: { layer_height, infill, walls, nozzle_temp, bed_temp, material, printer }
    tags        TEXT,   -- JSON array of strings
    created_at  INTEGER NOT NULL
);
```

### New table: `print_photos`

```sql
CREATE TABLE IF NOT EXISTS print_photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT    NOT NULL,
    filename    TEXT    NOT NULL,
    source      TEXT    NOT NULL,  -- "upload" | "webcam"
    captured_at INTEGER NOT NULL
);
```

Photos stored on disk at `data/photos/<job_id>/<filename>`. The existing k8s PV mounts `data/` so photos persist across restarts automatically.

### Relationship to existing tables

`print_jobs.job_id` is the same natural key already used across `print_spools`, `project_prints`, history records, and InfluxDB. No foreign key constraint — join by `job_id` where needed.

---

## Backend

### New router: `app/routes/prints.py`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/prints/:job_id` | Full print detail: stats (from history/InfluxDB) + `print_jobs` row |
| `PATCH` | `/api/prints/:job_id` | Update notes, settings, tags |
| `GET` | `/api/prints/:job_id/photos` | List photos for a job |
| `POST` | `/api/prints/:job_id/photos` | Upload a photo (multipart) |
| `DELETE` | `/api/prints/:job_id/photos/:id` | Delete a photo |
| `GET` | `/api/photos/:job_id/:filename` | Serve photo file |

### New db functions (`app/db.py`)

```python
get_or_create_print_job(job_id: str) -> dict
update_print_job(job_id: str, data: dict) -> dict
add_print_photo(job_id: str, filename: str, source: str) -> dict
list_print_photos(job_id: str) -> list[dict]
delete_print_photo(photo_id: int) -> None
```

### Auto-snapshot on print completion

Hook into the existing print-completion event in `app/recorder.py`. On completion:
1. Fetch a snapshot from the configured webcam snapshot URL
2. Save to `data/photos/<job_id>/webcam_<ts>.jpg`
3. Insert a `print_photos` row with `source="webcam"`

Best-effort only — failure is silently logged and never blocks the completion flow.

### History endpoint enhancement

`GET /api/history` response extended: each record gains `has_detail: bool` (true if a `print_jobs` row exists) and `photo_count: int`. Enables the history page to show a 📷 indicator without extra queries.

---

## Frontend

### New route

`/prints/:job_id` added to `router.ts` and `printer-app.ts`, following the same pattern as `/projects/:id`.

### New files

| File | Purpose |
|------|---------|
| `frontend/src/pages/print-detail-page.ts` | Page component |
| `frontend/src/components/print-settings-editor.ts` | Inline 8-field settings grid with edit toggle |
| `frontend/src/components/print-photos.ts` | Photo gallery, webcam badge, upload, delete, click-to-enlarge |

### Page layout (top → bottom)

1. **Breadcrumb** — `← history · <project name>` (both clickable)
2. **Header** — filename + date + tags (inline add/remove)
3. **Stats grid** — duration · cost · filament · spool (4 cols, same style as project detail)
4. **Print settings block** — 8-field display grid; clicking "edit" replaces the grid in-place with input fields (no modal); saves on blur or confirm button
5. **Photos** — thumbnail strip with webcam badge, `+ upload` button, click to enlarge
6. **Notes** — reuses `<markdown-editor>`, saves on blur

### History page changes (`history-page.ts`)

- Each row becomes clickable → navigates to `/prints/:job_id`
- Rows with `photo_count > 0` show a small 📷 indicator
- Existing row layout preserved — cursor:pointer + click handler only

### Project detail page changes (`project-detail-page.ts`)

- Print job rows in the files/prints section become links to `/prints/:job_id`
- One-line change per row

### New API functions (`api.ts`)

```typescript
getPrintJob(jobId: string): Promise<PrintJob>
updatePrintJob(jobId: string, data: Partial<PrintJob>): Promise<PrintJob>
getPrintPhotos(jobId: string): Promise<PrintPhoto[]>
uploadPrintPhoto(jobId: string, file: File): Promise<PrintPhoto>
deletePrintPhoto(jobId: string, photoId: number): Promise<void>
```

### New types (`types.ts`)

```typescript
interface PrintSettings {
  layer_height?: string
  infill?: string
  walls?: string
  nozzle_temp?: string
  bed_temp?: string
  material?: string
  printer?: string
  nozzle?: string
}

interface PrintJob {
  job_id: string
  notes: string | null
  settings: PrintSettings | null
  tags: string[]
  created_at: number
}

interface PrintPhoto {
  id: number
  job_id: string
  filename: string
  source: 'upload' | 'webcam'
  captured_at: number
}
```

---

## Out of Scope

- Rating/stars (explicitly not selected)
- Search/filter by tag (follow-up)
- History page full redesign (only minimal clickability changes)
- S3 or external photo storage
