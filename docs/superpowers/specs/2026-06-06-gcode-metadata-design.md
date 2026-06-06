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
| `source_url` | Custom `; meta:` comment |
| `project_name` | Custom `; meta:` comment |

## Storage

`gcode_meta TEXT` column on `print_jobs` table — JSON, read-only, never overwritten
by user edits (that's `settings`). Populated at job completion and lazily on first
detail page view.
