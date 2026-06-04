# Projects Feature — Design Spec

**Date:** 2026-06-04
**Status:** Approved

## Overview

A new Projects section for the printer dashboard. A project is a flexible container for a 3D printing model or build — it groups related files (STL sources + gcode references), external links (Printables, Thingiverse, etc.), freeform notes, and associations to completed print history records. The primary value is tracking how many times each part has been printed and how much total time and money the project has consumed.

## Routes & Navigation

| Route | Component | Description |
|---|---|---|
| `/projects` | `projects-page.ts` | Grid of project cards |
| `/projects/:id` | `project-detail-page.ts` | Single-column project detail |

The existing router (`router.ts`) needs a small extension to support parameterized routes (`:id` pattern matching). The top nav gains a "projects" link alongside history and spools.

## Data Model

Four new SQLite tables added in `db.py` and initialised in `init_db()`.

```sql
CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    notes       TEXT,
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL CHECK(type IN ('gcode', 'stl')),
    filename    TEXT    NOT NULL,
    label       TEXT
);

CREATE TABLE IF NOT EXISTS project_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url         TEXT    NOT NULL,
    label       TEXT
);

CREATE TABLE IF NOT EXISTS project_prints (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_file_id INTEGER REFERENCES project_files(id) ON DELETE SET NULL,
    job_id          TEXT    NOT NULL,
    duration_s      REAL,
    filament_g      REAL,
    cost_total      REAL,
    UNIQUE(project_id, job_id)
);
```

**Key relationships:**
- `project_files.filename` — for `gcode` type: Moonraker filename (no upload); for `stl` type: path on disk under `settings.uploads_dir`
- `project_files.label` — optional display name overriding the raw filename
- `project_prints.project_file_id` — nullable; a print can be linked to a project without pinning to a specific file
- `ON DELETE CASCADE` — deleting a project removes all its files, links, and print associations
- `ON DELETE SET NULL` — removing a file from a project keeps the print associations but clears the file reference

## Backend

New router: `app/routes/projects.py`, registered in `app/main.py`.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List all projects with stats (print count, total time, total cost, total filament) |
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects/:id` | Get project with files, links, and aggregated stats |
| `PATCH` | `/api/projects/:id` | Update name or notes |
| `DELETE` | `/api/projects/:id` | Delete project (cascades) |
| `POST` | `/api/projects/:id/files` | Add a gcode reference (body: `{type, filename, label}`) |
| `POST` | `/api/projects/:id/files/upload` | Upload an STL file (multipart) |
| `DELETE` | `/api/projects/:id/files/:file_id` | Remove file (deletes STL from disk if type=stl) |
| `POST` | `/api/projects/:id/links` | Add a link |
| `DELETE` | `/api/projects/:id/links/:link_id` | Remove a link |
| `POST` | `/api/projects/:id/prints` | Link a print record (`{job_id, project_file_id?}`) |
| `DELETE` | `/api/projects/:id/prints/:job_id` | Unlink a print record |

### Stats — cached at link time

History is not in SQLite: print records live in Moonraker and cost data in InfluxDB. To avoid live lookups on every project list load, `project_prints` caches `duration_s`, `filament_g`, and `cost_total` at the moment a print is linked (matching how `print_spools.filament_used_g` already works).

**When linking a print:**
1. Fetch job details from Moonraker: `GET /server/history/job?uid={job_id}` → `duration_s`, `filament_g`, `filename`
2. Look up cost from InfluxDB by filename → `cost_total`
3. Store all three in `project_prints`

**Aggregated stats query** (pure SQLite, used in GET /api/projects and GET /api/projects/:id):

```sql
SELECT
    COUNT(id)          AS print_count,
    SUM(duration_s)    AS total_duration_s,
    SUM(cost_total)    AS total_cost,
    SUM(filament_g)    AS total_filament_g
FROM project_prints
WHERE project_id = ?
```

Per-file stats use the same query filtered by `project_file_id`.

**Stale data:** If a spool is reassigned and costs recalculated, `project_prints` cached values become stale — same accepted trade-off as `print_spools`. A future "refresh stats" action can be added later if needed (out of scope).

### STL file storage

- Config key: `settings.uploads_dir` (new entry in `config.py`, default `./uploads`)
- Upload endpoint: single POST (no chunking — STLs are small)
- On file delete: `os.remove()` the file from disk, then delete the DB row
- Filename collisions: append a short uuid suffix to the stored filename

## Frontend

### New files

| File | Purpose |
|---|---|
| `src/pages/projects-page.ts` | Grid page — lists project cards, handles create |
| `src/pages/project-detail-page.ts` | Detail page — single column layout |
| `src/components/markdown-editor.ts` | Obsidian-style click-to-edit markdown component |
| `src/components/project-files-section.ts` | File list with upload, gcode picker, print linking |
| `src/components/project-card.ts` | Single project card for the grid |

### Modified files

| File | Change |
|---|---|
| `src/router.ts` | Add `/projects` and `/projects/:id` with param extraction |
| `src/components/top-nav.ts` | Add "projects" nav link |
| `src/components/history-preview.ts` | Add "assign to project" action per print row |
| `src/api.ts` | New project API calls |
| `src/types.ts` | New `Project`, `ProjectFile`, `ProjectLink`, `ProjectStats` types |
| `frontend/package.json` | Add `marked` dependency |

### New dependency

`marked` (npm) — markdown parsing for the editor's render mode. ~15kb minified. No other new dependencies.

### `markdown-editor` component

Two internal states: `viewing` and `editing`.

- **Viewing:** renders `value` through `marked.parse()` as inner HTML. Clicking anywhere on the element switches to editing. Empty state shows muted placeholder "Click to add notes…"
- **Editing:** replaces rendered HTML with a `<textarea>` pre-filled with raw markdown. Auto-focuses, auto-resizes to content height. On blur: fires `PATCH /api/projects/:id` with `{notes}`, re-renders immediately (optimistic). On failure: reverts to previous value and shows a brief error indicator.
- **Interface:** `@property() value: string`, `@property() projectId: number`, fires `notes-changed` custom event on save.

### Print totals

Displayed as a 4-stat bar directly below the project header: **prints · total time · total cost · filament used**. Stats are returned by the detail API endpoint, aggregated from linked history records. Per-file rows also show a compact `€x.xx · xh` breakdown.

The same total cost and time are shown on the project list cards.

### Print association — bidirectional

**From project detail:** "link prints" button on each file row opens a picker modal. For `gcode` files the picker pre-filters history by matching filename. For `stl` files it shows all history unfiltered. Multi-select. Saves via `POST /api/projects/:id/prints`.

**From history page:** each print row gets an "assign to project" action (next to the existing spool assign). Opens a mini modal: pick project → optionally pick file within that project → saves. Shows current assignment if one exists, with option to clear.

## Error handling

- STL upload failure: show inline error, do not add the file row
- Markdown save failure: revert notes to last saved value, show red flash on the editor
- Print link conflict (already linked to this project): silently ignore the duplicate (the `UNIQUE` constraint returns a no-op)
- Delete project: confirm dialog before proceeding

## Out of scope

- Searching or filtering projects
- Project tags or categories
- Sharing projects externally
- Image/thumbnail upload for projects
