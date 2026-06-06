export interface PrinterState {
  state: 'printing' | 'standby' | 'paused' | 'error' | 'complete' | string
  filename: string
  progress: number       // 0–100
  layer: number | null
  layer_total: number | null
  time_remaining: number // elapsed seconds (print_duration)
  filament_used: number  // mm
  speed: number          // mm/s
  z_position: number     // mm
}

export interface Temps {
  hotend_actual: number
  hotend_target: number
  bed_actual: number
  bed_target: number
}

export interface Power {
  watts: number
  eur_per_kwh: number
  switch: 'on' | 'off' | 'unknown'
}

export interface PiStats {
  cpu_temp: number
  cpu_load: number
  memory_pct: number
  disk_pct: number
  uptime_s: number
}

export interface Spool {
  id: number
  brand: string
  material: string
  color: string
  color_hex: string | null
  cost_per_gram: number
  initial_weight_g: number
  current_weight_g: number
  notes: string | null
  active: number
  created_at: number
}

export interface PrintRecord {
  time: string | null
  filename: string
  status?: string
  duration_s: number
  filament_g: number
  avg_watts: number | null
  avg_eur_per_kwh: number | null
  cost_electricity: number | null
  cost_filament: number | null
  cost_total: number | null
  spool_id: string | null
  material: string | null
  spool: SpoolRef | null
  job_id?: string
  project?: { id: number; name: string } | null
}

export interface SpoolRef {
  id: number | null
  brand: string | null
  material: string | null
  color: string | null
  color_hex: string | null
}

export interface PredictResult {
  filename: string
  quantity: number
  spool_id: number | null
  material: string | null
  filament_g: number
  estimated_time_s: number
  layer_count: number | null
  avg_watts: number
  avg_eur_per_kwh: number
  cost_filament: number
  cost_electricity: number
  cost_total: number
}

export interface GcodeFile {
  filename: string
  size: number
  modified: number
  filament_weight_total?: number
  estimated_time?: number
  layer_height?: number
  first_layer_height?: number
  layer_count?: number
}

export interface Project {
  id: number
  name: string
  notes: string | null
  created_at: number
  print_count: number
  total_duration_s: number | null
  avg_duration_s: number | null
  max_duration_s: number | null
  total_cost: number | null
  avg_cost: number | null
  total_filament_g: number | null
  cover_url?: string | null
  cover_link_id?: number | null
  files?: ProjectFile[]
  links?: ProjectLink[]
  prints?: ProjectPrint[]
}

export interface ProjectFile {
  id: number
  project_id: number
  type: 'gcode' | 'stl'
  filename: string
  label: string | null
  print_count?: number
  total_duration_s?: number | null
  total_cost?: number | null
  total_filament_g?: number | null
}

export interface ProjectLink {
  id: number
  project_id: number
  url: string
  label: string | null
  meta?: {
    title?: string
    description?: string
    image_url?: string
    print_settings?: {
      layer_height?: string
      walls?: string
      infill?: string
      nozzle?: string
      material?: string
      printer?: string
      weight_g?: string
      parts?: string
    } | null
  } | null
}

export interface ProjectPrint {
  id: number
  project_id: number
  project_file_id: number | null
  job_id: string
  duration_s: number | null
  filament_g: number | null
  cost_total: number | null
}
