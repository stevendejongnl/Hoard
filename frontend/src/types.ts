export interface PrinterState {
  state: 'printing' | 'standby' | 'paused' | 'error' | 'complete' | string
  filename: string
  progress: number      // 0–100
  layer: number | null
  layer_total: number | null
  time_remaining: number // seconds
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
  time: string
  filename: string
  duration_s: number
  filament_g: number
  avg_watts: number
  avg_eur_per_kwh: number
  cost_electricity: number
  cost_filament: number
  cost_total: number
  spool_id: string | null
  material: string | null
  spool: SpoolRef | null
  job_id?: string
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
}
