export interface PrinterState {
  state: 'printing' | 'standby' | 'paused' | 'error' | 'complete' | string
  filename: string
  progress: number // 0–100
  layer: number | null
  layer_total: number | null
  time_remaining: number // elapsed seconds (print_duration)
  filament_used: number // mm
  speed: number // mm/s
  z_position: number // mm
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
  switch: string
}

/** A switch from Home Assistant that the app controls, as it is set in HA_SWITCHES. */
export interface HomeAssistantSwitch {
  key: string
  label: string
  entity_id: string
  /** 'on' or 'off', or 'unavailable' or 'unknown' when Home Assistant cannot tell */
  state: string
  /** the key of the switch that must be on before this one may be switched on */
  requires: string | null
  /** the printer power, which the power events also report */
  is_printer: boolean
  /** what the switch powers, from the config; empty when it has none */
  description?: string
}

/** The automatic power-off of the printer: the setting, and when the power goes off (Unix seconds) or null. */
export interface AutoPowerOffStatus {
  enabled: boolean
  idle_minutes: number
  off_at: number | null
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
  tag_id?: string | null
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
  has_detail?: boolean
  photo_count?: number
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
  type: 'gcode' | 'stl' | '3mf'
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

export interface PrintSettings {
  layer_height?: string
  infill?: string
  walls?: string
  nozzle_temp?: string
  bed_temp?: string
  material?: string
  nozzle?: string
}

export interface PrintPhoto {
  id: number
  job_id: string
  filename: string
  source: 'upload' | 'webcam'
  captured_at: number
}

export interface PrintJob {
  job_id: string
  notes: string | null
  settings: PrintSettings | null
  photos: PrintPhoto[]
  created_at: number
  // merged from PrintRecord when returned by GET /api/prints/:job_id
  filename?: string
  time?: string | null
  duration_s?: number | null
  filament_g?: number | null
  cost_total?: number | null
  cost_electricity?: number | null
  cost_filament?: number | null
  avg_watts?: number | null
  avg_eur_per_kwh?: number | null
  spool_id?: string | null
  spool?: SpoolRef | null
  gcode_meta?: GcodeMeta | null
  project?: { id: number; name: string } | null
}

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
  source_url?: string
  project_name?: string
  [key: string]: string | number | undefined
}

export interface SystemRow {
  key: string
  label: string
  value: string
}

export interface SystemSection {
  key: string
  title: string
  rows: SystemRow[]
}

export interface SystemFault {
  key: string
  severity: 'error' | 'warning'
  source: string
  title: string
  detail: string
}

export interface FaultRecord extends SystemFault {
  first_seen: number
  last_seen: number
  cleared_at: number | null
}

export interface SystemReport {
  reachable: boolean
  sections: SystemSection[]
  active_faults: SystemFault[]
  fault_history: FaultRecord[]
  hidden: string[]
}

export type DetectionState = 'off' | 'idle' | 'watching' | 'unavailable' | 'alert'
export type DetectionAction = 'notify' | 'pause'
export type DetectionVerdict = 'real' | 'false_alarm'

export interface DetectionSettings {
  enabled: boolean
  /** a score from 0 to 1 at or above which a frame looks failed */
  threshold: number
  interval_seconds: number
  window_size: number
  required_frames: number
  action: DetectionAction
}

export interface ThresholdSuggestion {
  threshold: number
  reason: string
}

export interface DetectionStatus {
  /** false while the server has no detector address: nothing about detection is shown then */
  configured: boolean
  /** true when a vision model outside the network judges the camera image */
  frames_leave_network: boolean
  state: DetectionState
  score: number | null
  settings: DetectionSettings
  suggestion: ThresholdSuggestion | null
}

export interface DetectionBox {
  label: string
  score: number
  /** centre x, centre y, width and height in pixels of the frame, or null */
  box: number[] | null
}

export interface DetectionAlert {
  id: number
  created_at: number
  filename: string
  score: number
  detections: DetectionBox[]
  has_frame: boolean
  verdict: DetectionVerdict | null
  frame_url: string | null
}

export interface ControlHeater {
  key: string
  label: string
  temperature: number
  target: number
}

export interface ControlFan {
  /** empty for the part fan */
  key: string
  label: string
  percent: number
}

/** What the cards of the Control page show, as the printer reports it. */
export interface ControlStatus {
  state: string
  locked: boolean
  position: { x: number; y: number; z: number }
  homed: string
  heaters: ControlHeater[]
  speed_percent: number
  flow_percent: number
  z_offset: number
  /** the probe that is moved by hand during a manual calibration */
  manual_probe: { active: boolean; z: number | null }
  fans: ControlFan[]
}

export interface Macro {
  name: string
  /** what the macro says about itself in the printer config; empty when it says nothing */
  description: string
  /** the category the person gave it in Fluidd; empty when it has none */
  category: string
}

export interface ConsoleLine {
  message: string
  /** seconds since 1970 */
  time: number
  type: 'command' | 'response'
}

export interface BedMesh {
  profile_name: string
  mesh_min: number[]
  mesh_max: number[]
  probed_matrix: number[][]
}

export type ControlDevice = 'desktop' | 'phone'

export interface AccessRequest {
  id: string
  client: string
  reason: string
  /** seconds since 1970: after this the request is gone */
  expires_at: number
}

export interface AccessGrant {
  client: string
  /** seconds since 1970: after this the access has ended */
  expires_at: number
}

export interface ControlAccessSnapshot {
  pending: AccessRequest[]
  granted: AccessGrant[]
}

/** What Klipper says about itself: ready, startup, shutdown, error, or disconnected from Moonraker. */
export interface KlipperState {
  state: string
  message: string
}

/** One value that waits for a save: what the printer runs with now, and what it will have after the save */
export interface PendingChange {
  section: string
  key: string
  old: string | null
  new: string
}

export interface PendingConfig {
  pending: boolean
  changes: PendingChange[]
}

/** A web client of the printer host, such as Fluidd or Mainsail, and where it is served. */
export interface WebClient {
  name: string
  url: string
}
