import type { GcodeFile, HomeAssistantSwitch, PredictResult, PrintRecord, Spool } from './types'
import type { Project, ProjectFile, ProjectLink, ProjectPrint } from './types'
import type { PrintJob, PrintPhoto } from './types'
import type { TemperatureSample } from './temperature-chart-geometry'

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
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
export const firmwareRestart = () => fetchJson('/api/control/firmware_restart', { method: 'POST' })
export const emergencyStop = () => fetchJson('/api/control/emergency_stop', { method: 'POST' })
export const startPrint = (filename: string) =>
  fetchJson(`/api/control/print?filename=${encodeURIComponent(filename)}`, { method: 'POST' })
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
