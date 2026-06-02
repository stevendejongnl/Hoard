# printer dashboard — design spec

**Date:** 2026-06-02  
**Project:** `workspace/personal/3d-printing/printer`  
**Stack:** FastAPI · Lit · SSE · InfluxDB · SQLite · Moonraker · Home Assistant

---

## Overview

A personal web dashboard called **printer** for monitoring and costing 3D prints on a Voxelab Aquila (modified). Data flows exclusively from existing infrastructure — Moonraker, Home Assistant, and InfluxDB. The app adds two thin layers of its own: a spool manager (SQLite) and a print cost recorder (InfluxDB writes). No data is invented or duplicated elsewhere.

---

## Pages & Navigation

Three pages, linked from a persistent top nav:

| Route | Content |
|---|---|
| `/` | Live status + recent prints preview + cost predictor + spools preview |
| `/history` | Full paginated print history |
| `/spools` | Full spool list; add/edit via modal |

The nav bar shows the app name (`printer.madebysteven.nl`), page links (`history`, `spools`), and a live printing badge (cyan, animated dot) when the printer is active.

---

## Visual Design

**Precision dark + cyan-A:**
- Background: `#0e0e0e` deep, `#141414` surfaces, `#1a1a1a` raised
- Borders: `#222` standard, `#1a1a1a` subtle
- Text: `#e0e0e0` primary, `#555` muted, `#333` dim
- Accent: `#22d3ee` (cyan) — used on: status badge, power draw reading, history cost column, active spool border, slider thumb/fill, "assign spool" prompt, links
- Typography: system sans-serif, font-weight 200–300 for large numbers
- Progress bar: 1px cyan line
- No cards with drop shadows. Surfaces use `border: 1px solid var(--border)` only.

---

## Architecture

```
Moonraker WS ──────┐
Moonraker REST ─────┤
                    ├──► FastAPI SSE Hub ──► /stream (SSE) ──► Lit frontend
HA REST (30/60s) ───┤
                    │
InfluxDB ───────────┴──► /api/* (REST) ──► Lit frontend
SQLite (spools) ────────► /api/* (REST) ──► Lit frontend
```

### Backend — FastAPI

- `app/main.py` — FastAPI app, lifespan manages Moonraker WS connection
- `app/sse.py` — SSE hub: subscribes to Moonraker websocket, polls HA, merges into a single `/stream` endpoint. One background task per data source.
- `app/moonraker.py` — Moonraker REST + WS client (httpx + websockets)
- `app/ha.py` — HA REST client, polls `sensor.3d_printer_power` and `sensor.energyzero_today_energy_current_hour_price`
- `app/influx.py` — InfluxDB client (reuse pattern from `changewatch`); writes on print completion, queries for history
- `app/db.py` — SQLite via aiosqlite; spools table + print_spools link table
- `app/recorder.py` — listens for Moonraker `print_done` event, calculates cost, writes to InfluxDB
- `app/routes/` — REST endpoints: files, history, spools, predict

### SSE event types (streamed to `/stream`)

| Event | Fields |
|---|---|
| `printer_state` | state, filename, progress, layer, layer_total, time_remaining |
| `temps` | hotend_actual, hotend_target, bed_actual, bed_target |
| `power` | watts, eur_per_kwh |
| `pi_stats` | cpu_temp, cpu_load, memory_pct, disk_pct, uptime_s |

### REST endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/stream` | SSE event stream |
| GET | `/api/files` | List files from Moonraker (with gcode metadata) |
| POST | `/api/files/upload` | Forward upload to Moonraker |
| GET | `/api/history` | Query InfluxDB print records, joined with SQLite spool data |
| GET | `/api/predict` | Parse gcode from Moonraker, return cost estimate |
| GET | `/api/spools` | List spools from SQLite |
| POST | `/api/spools` | Create spool |
| PATCH | `/api/spools/{id}` | Update spool (weight, cost, active flag) |
| DELETE | `/api/spools/{id}` | Delete spool |
| PATCH | `/api/history/{job_id}/spool` | Retroactively assign spool to a print |

### Frontend — Lit + Vite

Components (one file each under `frontend/src/components/`):

| Component | Page | Role |
|---|---|---|
| `<printer-app>` | all | Root, holds SSE connection, routes |
| `<top-nav>` | all | Nav bar, printing badge |
| `<live-status>` | `/` | Cost estimate, progress, temps, power |
| `<pi-strip>` | `/` | CPU temp, load, memory, disk, uptime |
| `<history-preview>` | `/` | 3 recent prints + "view all" link |
| `<cost-predictor>` | `/` | File picker, spool picker, qty slider, breakdown |
| `<spools-preview>` | `/` | 2 active spools + "manage" link |
| `<history-page>` | `/history` | Full paginated history table |
| `<spools-page>` | `/spools` | Full spool grid, add/edit modals |
| `<file-browser-modal>` | modal | Klipper file list, search, upload |
| `<spool-modal>` | modal | Add / edit spool form |

---

## Data Storage

### InfluxDB — measurement: `print_job`

Written at print completion by `recorder.py`.

**Fields:** `duration_s`, `filament_g`, `avg_watts`, `avg_eur_per_kwh`, `cost_electricity`, `cost_filament`, `cost_total`  
**Tags:** `filename`, `spool_id` (nullable), `material` (nullable)  
**Timestamp:** print completion time

### SQLite — spools

```sql
CREATE TABLE spools (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    brand       TEXT NOT NULL,
    material    TEXT NOT NULL,       -- PLA+, PETG, etc.
    color       TEXT NOT NULL,
    color_hex   TEXT,               -- #1a1a1a for swatch
    cost_per_gram REAL NOT NULL,
    initial_weight_g REAL NOT NULL,
    current_weight_g REAL NOT NULL,
    notes       TEXT,
    active      INTEGER DEFAULT 0,  -- 1 = currently loaded
    created_at  INTEGER NOT NULL
);

CREATE TABLE print_spools (
    job_id      TEXT PRIMARY KEY,   -- Moonraker job_id
    spool_id    INTEGER REFERENCES spools(id),
    filament_used_g REAL
);
```

Retroactive spool assignment: `PATCH /api/history/{job_id}/spool` updates `print_spools` and rewrites the InfluxDB point (delete original + write new with updated `spool_id` / `material` tags — InfluxDB v2 does not support in-place tag mutation).

---

## Key Feature Behaviours

### Live status section (home page)
- SSE drives all values; reconnects automatically on disconnect
- "Estimated cost" = filament_g_so_far × active_spool.cost_per_gram + (elapsed_h × avg_watts/1000 × current_eur_per_kwh)
- "open in fluidd →" links to `http://klipper.madebysteven.nl`
- Pi strip values from Moonraker `/machine/proc_stats` — polled every 30s, streamed via SSE

### File browser modal
- Opens from: "browse files →" in live section, file picker in predictor
- Lists files from Moonraker `/server/files/list` with metadata (size, modified)
- Gcode metadata (filament_g, estimated_time) read from Moonraker `/server/files/metadata`
- Search filters client-side
- "↑ upload new" triggers file input → POST to `/api/files/upload` → forwarded to Moonraker
- After upload, file list refreshes

### Cost predictor
- File selected from modal or already populated from current print
- Spool dropdown populated from SQLite active/all spools
- Quantity slider: 1–20, default 1, cyan fill tracks position
- Cost = quantity × (filament_g × spool.cost_per_gram + estimated_time_h × avg_watts/1000 × avg_27h_eur_per_kwh)
- Energy price shown as "27h avg" pulled from HA history on page load

### Print recorder (automatic)
- On Moonraker `print_done` websocket event:
  1. Fetch job details from Moonraker history
  2. Query HA history for `sensor.3d_printer_power` over print duration → compute avg watts
  3. Query HA history for `sensor.energyzero_today_energy_current_hour_price` → compute time-weighted avg
  4. Look up active spool from SQLite
  5. Write `print_job` measurement to InfluxDB
  6. Insert row into `print_spools` with active spool

### Spools page + modal
- Grid of all spools; active spool has cyan border
- "Set as active" button sets `active=1`, clears others
- Remaining weight auto-decremented on print completion (from `filament_used_g`)
- Add/edit modal: brand, material, color (text + hex picker), cost per gram, initial weight, current weight, notes
- Delete only allowed if spool has no `print_spools` references (or ask to unlink)

### History page
- Full table: filename, date, duration, filament g, spool (clickable to reassign), cost breakdown, total cost
- Sorted by date desc, paginated (20/page)
- "assign spool" inline for records with no spool linked

---

## Infrastructure

### Deployment
- Docker Compose, same pattern as other personal projects
- Service: `printer` on port `8765` (internal)
- Zoraxy route: `printer.madebysteven.nl` → `<host-ip>:8765` — host IP determined at deployment time based on which machine runs the container
- Static frontend served by FastAPI (`StaticFiles`)

### Environment config (`.env`)
```
MOONRAKER_URL=http://192.168.1.102
MOONRAKER_WS=ws://192.168.1.102/websocket
HA_URL=http://192.168.1.25:8123
HA_TOKEN=...
INFLUXDB_URL=http://192.168.1.22:8086
INFLUXDB_TOKEN=...
INFLUXDB_ORG=my-org
INFLUXDB_BUCKET=home
DATABASE_PATH=/data/printer.db
```

### Project structure
```
printer/
├── app/
│   ├── main.py
│   ├── sse.py
│   ├── recorder.py
│   ├── moonraker.py
│   ├── ha.py
│   ├── influx.py
│   ├── db.py
│   └── routes/
│       ├── files.py
│       ├── history.py
│       ├── spools.py
│       └── predict.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   └── main.ts
│   ├── package.json
│   └── vite.config.ts
├── pyproject.toml
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

## Out of scope

- Authentication (internal network only, behind Zoraxy app auth if needed later)
- Multi-printer support
- Webcam feed (link to Fluidd for that)
- Filament usage forecasting beyond single-print estimates
