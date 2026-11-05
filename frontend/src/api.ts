import type { DetectionAlert, DetectionSettings, DetectionStatus, DetectionVerdict } from './types'
import type { GcodeFile, HomeAssistantSwitch, PredictResult, PrintRecord, Spool, SystemReport } from './types'
import type { Project, ProjectFile, ProjectLink, ProjectPrint } from './types'
import type { PrintJob, PrintPhoto } from './types'
import type { TemperatureSample } from './temperature-chart-geometry'
import type { ControlLayout } from './control-layout'
import type { BedMesh, ConsoleLine, ControlAccessSnapshot, ControlDevice, ControlStatus, Macro } from './types'
import type { AutoPowerOffStatus, KlipperState, WebClient } from './types'

const BAD_GATEWAY_STATUS = 502
const PRINTER_UNREACHABLE_MESSAGE = 'The printer cannot be reached'

/** A request that the server answered with an error status. */
export class HttpError extends Error {
  readonly status: number
  /** what the server said was wrong, when it said; the printer's own words for a command it refused */
  readonly detail: string

  constructor(status: number, statusText: string, detail = '') {
    super(`${status} ${statusText}`)
    this.status = status
    this.detail = detail
  }
}

/** The text for a load that failed: the server answers 502 when the printer cannot be reached. */
export function describeLoadFailure(error: unknown, fallback: string): string {
  return error instanceof HttpError && error.status === BAD_GATEWAY_STATUS ? PRINTER_UNREACHABLE_MESSAGE : fallback
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    return typeof body.detail === 'string' ? body.detail : ''
  } catch {
    return ''
  }
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  if (!response.ok) throw new HttpError(response.status, response.statusText, await readErrorDetail(response))
  return response.json() as Promise<T>
}

// Files
export const getFiles = () => fetchJson<GcodeFile[]>('/api/files')
export const getFileMetadata = (filename: string) =>
  fetchJson<GcodeFile>(`/api/files/metadata?filename=${encodeURIComponent(filename)}`)
export const injectThumbnail = (gcodeFilename: string, stlFile: File) => {
  const formData = new FormData()
  formData.append('stl_file', stlFile)
  formData.append('gcode_filename', gcodeFilename)
  return fetchJson<{ status: string; filename: string }>('/api/files/thumbnail/inject', {
    method: 'POST',
    body: formData,
  })
}

export const uploadFile = (file: File) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  const formData = new FormData()
  formData.append('file', file)
  return fetchJson<{ item: { path: string } }>('/api/files/upload', {
    method: 'POST',
    body: formData,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))
}

// History
export const getHistory = (limit = 20, offset = 0) =>
  fetchJson<{ records: PrintRecord[]; total: number }>(`/api/history?limit=${limit}&offset=${offset}`)
export const assignSpool = (jobId: string, spoolId: number) =>
  fetchJson(`/api/history/${encodeURIComponent(jobId)}/spool`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spool_id: spoolId }),
  })
export const recalculateCost = (jobId: string) =>
  fetchJson(`/api/history/${encodeURIComponent(jobId)}/recalculate`, { method: 'POST' })

export const restoreCost = (jobId: string) =>
  fetchJson(`/api/history/${encodeURIComponent(jobId)}/restore`, { method: 'POST' })

// Spools
export const getSpools = () => fetchJson<Spool[]>('/api/spools')
export const createSpool = (data: Partial<Spool>) =>
  fetchJson<Spool>('/api/spools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const updateSpool = (id: number, data: Partial<Spool>) =>
  fetchJson<Spool>(`/api/spools/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export async function getSpoolByTag(tagId: string): Promise<Spool | null> {
  const response = await fetch(`/api/spools/by-tag/${encodeURIComponent(tagId)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}
export const deleteSpool = (id: number) => fetch(`/api/spools/${id}`, { method: 'DELETE' })

// Webcams
export interface Webcam {
  name: string
  stream_url: string
  snapshot_url: string
  flip_horizontal: boolean
  flip_vertical: boolean
  rotation: number
  enabled: boolean
  aspect_ratio: string
  target_fps?: number
}
export const getWebcams = () => fetchJson<Webcam[]>('/api/webcams')

// Control
export const powerOn = () => fetchJson('/api/control/power/on', { method: 'POST' })
export const powerOff = () => fetchJson('/api/control/power/off', { method: 'POST' })
export const getSwitches = () => fetchJson<HomeAssistantSwitch[]>('/api/control/switches')
export const setSwitchState = (key: string, turnOn: boolean) =>
  fetchJson(`/api/control/switches/${encodeURIComponent(key)}/${turnOn ? 'on' : 'off'}`, { method: 'POST' })
export const getAutoPowerOff = () => fetchJson<AutoPowerOffStatus>('/api/control/auto-power-off')
export const postponeAutoPowerOff = (minutes: number) =>
  fetchJson('/api/control/auto-power-off/postpone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes }),
  })
export const cancelAutoPowerOff = () => fetchJson('/api/control/auto-power-off/cancel', { method: 'POST' })
export const getSystem = () => fetchJson<SystemReport>('/api/system')
export const setHiddenSystemRows = (keys: string[]) =>
  fetchJson('/api/system/hidden', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
export const firmwareRestart = () => fetchJson('/api/control/firmware_restart', { method: 'POST' })
export const emergencyStop = () => fetchJson('/api/control/emergency_stop', { method: 'POST' })
export const startPrint = (filename: string) =>
  fetchJson(`/api/control/print?filename=${encodeURIComponent(filename)}`, { method: 'POST' })
// Print failure detection
export const getDetection = () => fetchJson<DetectionStatus>('/api/detection')
export const saveDetectionSettings = (changes: Partial<DetectionSettings>) =>
  fetchJson<DetectionSettings>('/api/detection/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
export const getDetectionAlerts = (verdict?: DetectionVerdict | 'unlabelled') =>
  fetchJson<DetectionAlert[]>(`/api/detection/alerts${verdict ? `?verdict=${verdict}` : ''}`)
export const setDetectionVerdicts = (ids: number[], verdict: DetectionVerdict | null) =>
  fetchJson('/api/detection/alerts/verdicts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, verdict }),
  })

export const pausePrint = () => fetchJson('/api/control/pause', { method: 'POST' })
export const resumePrint = () => fetchJson('/api/control/resume', { method: 'POST' })
export const cancelPrint = () => fetchJson('/api/control/cancel', { method: 'POST' })

// Predict
export const predict = (filename: string, spoolId: number | null, quantity: number) => {
  const queryParameters = new URLSearchParams({ filename, quantity: String(quantity) })
  if (spoolId !== null) queryParameters.set('spool_id', String(spoolId))
  return fetchJson<PredictResult>(`/api/predict?${queryParameters}`)
}

// Projects
export const getProjects = () => fetchJson<Project[]>('/api/projects')

export const createProject = (name: string) =>
  fetchJson<Project>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const getProject = (id: number) => fetchJson<Project>(`/api/projects/${id}`)

export const updateProject = (id: number, data: { name?: string; notes?: string }) =>
  fetchJson<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteProject = (id: number) => fetch(`/api/projects/${id}`, { method: 'DELETE' })

export const addProjectFile = (projectId: number, data: { type: string; filename: string; label?: string }) =>
  fetchJson<ProjectFile>(`/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const uploadProjectStl = (projectId: number, file: File, label?: string) => {
  const formData = new FormData()
  formData.append('file', file)
  if (label) formData.append('label', label)
  return fetchJson<ProjectFile>(`/api/projects/${projectId}/files/upload`, {
    method: 'POST',
    body: formData,
  })
}

export const deleteProjectFile = (projectId: number, fileId: number) =>
  fetch(`/api/projects/${projectId}/files/${fileId}`, { method: 'DELETE' })

export const addProjectLink = (projectId: number, data: { url: string; label?: string }) =>
  fetchJson<ProjectLink>(`/api/projects/${projectId}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteProjectLink = (projectId: number, linkId: number, clearCover = false) =>
  fetch(`/api/projects/${projectId}/links/${linkId}?clear_cover=${clearCover}`, { method: 'DELETE' })

export const linkProjectPrint = (projectId: number, data: { job_id: string; project_file_id?: number }) =>
  fetchJson<ProjectPrint>(`/api/projects/${projectId}/prints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const unlinkProjectPrint = (projectId: number, jobId: string) =>
  fetch(`/api/projects/${projectId}/prints/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  })

export const refreshProjectPrint = (projectId: number, jobId: string) =>
  fetchJson<ProjectPrint>(`/api/projects/${projectId}/prints/${encodeURIComponent(jobId)}/refresh`, {
    method: 'PATCH',
  })

// Print jobs
export const getPrintJob = (jobId: string) =>
  fetchJson<PrintJob & { photos: PrintPhoto[] } & Partial<PrintRecord>>(`/api/prints/${encodeURIComponent(jobId)}`)

export const updatePrintJob = (jobId: string, data: Partial<Pick<PrintJob, 'notes' | 'settings'>>) =>
  fetchJson<PrintJob>(`/api/prints/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const getPrintPhotos = (jobId: string) =>
  fetchJson<PrintPhoto[]>(`/api/prints/${encodeURIComponent(jobId)}/photos`)

export const uploadPrintPhoto = (jobId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return fetchJson<PrintPhoto>(`/api/prints/${encodeURIComponent(jobId)}/photos`, { method: 'POST', body: formData })
}

export const deletePrintPhoto = (jobId: string, photoId: number) =>
  fetch(`/api/prints/${encodeURIComponent(jobId)}/photos/${photoId}`, { method: 'DELETE' })

// Temperatures
export const getTemperatureHistory = () =>
  fetchJson<{ samples: TemperatureSample[] }>('/api/temperatures/history').then((history) => history.samples)

// Control
const postJson = (path: string, body: object = {}) =>
  fetchJson<{ ok: boolean }>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const getControlStatus = () => fetchJson<ControlStatus>('/api/control/status')
export const sendControlCommand = (route: string, body: object = {}) => postJson(`/api/control/${route}`, body)
export const getMacros = () => fetchJson<Macro[]>('/api/control/macros')
export const getConsole = () => fetchJson<ConsoleLine[]>('/api/control/console')
export const getBedMesh = () => fetchJson<BedMesh>('/api/control/bed_mesh')
export const getControlLayout = (device: ControlDevice) => fetchJson<unknown>(`/api/control/layout/${device}`)
export const saveControlLayout = (device: ControlDevice, layout: ControlLayout) =>
  fetchJson<ControlLayout>(`/api/control/layout/${device}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(layout),
  })
export const resetControlLayout = (device: ControlDevice) =>
  fetchJson<{ ok: boolean }>(`/api/control/layout/${device}`, { method: 'DELETE' })

// Access for assistants
export const getControlAccess = () => fetchJson<ControlAccessSnapshot>('/api/control/access')
export const allowControlAccess = (requestId: string) =>
  postJson(`/api/control/access/${encodeURIComponent(requestId)}/allow`)
export const denyControlAccess = (requestId: string) =>
  postJson(`/api/control/access/${encodeURIComponent(requestId)}/deny`)
export const takeControlAccessBack = (client: string) =>
  fetchJson<{ ok: boolean }>(`/api/control/access/grants/${encodeURIComponent(client)}`, { method: 'DELETE' })

// Klipper
export const getKlipperState = () => fetchJson<KlipperState>('/api/control/klipper')
export const restartKlipper = () => postJson('/api/control/restart')
export const getWebClients = () => fetchJson<WebClient[]>('/api/control/web_clients')
