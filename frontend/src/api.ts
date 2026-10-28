import type { GcodeFile, PredictResult, PrintRecord, Spool } from './types'
import type { Project, ProjectFile, ProjectLink, ProjectPrint } from './types'
import type { PrintJob, PrintPhoto } from './types'
import type { TemperatureSample } from './temperature-chart-geometry'

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, opts)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

// Files
export const getFiles = () => req<GcodeFile[]>('/api/files')
export const getFileMetadata = (filename: string) =>
  req<GcodeFile>(`/api/files/metadata?filename=${encodeURIComponent(filename)}`)
export const injectThumbnail = (gcodeFilename: string, stlFile: File) => {
  const fd = new FormData()
  fd.append('stl_file', stlFile)
  fd.append('gcode_filename', gcodeFilename)
  return req<{ status: string; filename: string }>('/api/files/thumbnail/inject', {
    method: 'POST',
    body: fd,
  })
}

export const uploadFile = (file: File) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  const fd = new FormData()
  fd.append('file', file)
  return req<{ item: { path: string } }>('/api/files/upload', {
    method: 'POST',
    body: fd,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))
}

const CHUNK_SIZE = 50 * 1024 * 1024 // 50 MB — safely under Cloudflare 100 MB limit

export async function uploadFileChunked(
  file: File,
  onProgress?: (sent: number, total: number) => void,
): Promise<{ filename: string }> {
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const blob = file.slice(start, start + CHUNK_SIZE)

      const fd = new FormData()
      fd.append('file', blob, file.name)
      fd.append('upload_id', uploadId)
      fd.append('filename', file.name)
      fd.append('chunk_index', String(i))
      fd.append('total_chunks', String(totalChunks))

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120_000)
      try {
        await req('/api/files/chunks/upload', { method: 'POST', body: fd, signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }

      onProgress?.(i + 1, totalChunks)
    }
    return { filename: file.name }
  } catch (err) {
    // Clean up partial upload
    fetch(`/api/files/chunks/cancel/${uploadId}`, { method: 'DELETE' }).catch(() => {})
    throw err
  }
}

// History
export const getHistory = (limit = 20, offset = 0) =>
  req<{ records: PrintRecord[]; total: number }>(`/api/history?limit=${limit}&offset=${offset}`)
export const assignSpool = (jobId: string, spoolId: number) =>
  req(`/api/history/${encodeURIComponent(jobId)}/spool`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spool_id: spoolId }),
  })
export const recalculateCost = (jobId: string) =>
  req(`/api/history/${encodeURIComponent(jobId)}/recalculate`, { method: 'POST' })

export const restoreCost = (jobId: string) =>
  req(`/api/history/${encodeURIComponent(jobId)}/restore`, { method: 'POST' })

// Spools
export const getSpools = () => req<Spool[]>('/api/spools')
export const createSpool = (data: Partial<Spool>) =>
  req<Spool>('/api/spools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const updateSpool = (id: number, data: Partial<Spool>) =>
  req<Spool>(`/api/spools/${id}`, {
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
export const getWebcams = () => req<Webcam[]>('/api/webcams')

// Control
export const powerOn = () => req('/api/control/power/on', { method: 'POST' })
export const powerOff = () => req('/api/control/power/off', { method: 'POST' })
export const firmwareRestart = () => req('/api/control/firmware_restart', { method: 'POST' })
export const emergencyStop = () => req('/api/control/emergency_stop', { method: 'POST' })
export const startPrint = (filename: string) =>
  req(`/api/control/print?filename=${encodeURIComponent(filename)}`, { method: 'POST' })
export const pausePrint = () => req('/api/control/pause', { method: 'POST' })
export const resumePrint = () => req('/api/control/resume', { method: 'POST' })
export const cancelPrint = () => req('/api/control/cancel', { method: 'POST' })

// Predict
export const predict = (filename: string, spoolId: number | null, quantity: number) => {
  const params = new URLSearchParams({ filename, quantity: String(quantity) })
  if (spoolId !== null) params.set('spool_id', String(spoolId))
  return req<PredictResult>(`/api/predict?${params}`)
}

// Projects
export const getProjects = () => req<Project[]>('/api/projects')

export const createProject = (name: string) =>
  req<Project>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const getProject = (id: number) => req<Project>(`/api/projects/${id}`)

export const updateProject = (id: number, data: { name?: string; notes?: string }) =>
  req<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteProject = (id: number) => fetch(`/api/projects/${id}`, { method: 'DELETE' })

export const addProjectFile = (projectId: number, data: { type: string; filename: string; label?: string }) =>
  req<ProjectFile>(`/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const uploadProjectStl = (projectId: number, file: File, label?: string) => {
  const fd = new FormData()
  fd.append('file', file)
  if (label) fd.append('label', label)
  return req<ProjectFile>(`/api/projects/${projectId}/files/upload`, {
    method: 'POST',
    body: fd,
  })
}

export const deleteProjectFile = (projectId: number, fileId: number) =>
  fetch(`/api/projects/${projectId}/files/${fileId}`, { method: 'DELETE' })

export const addProjectLink = (projectId: number, data: { url: string; label?: string }) =>
  req<ProjectLink>(`/api/projects/${projectId}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteProjectLink = (projectId: number, linkId: number, clearCover = false) =>
  fetch(`/api/projects/${projectId}/links/${linkId}?clear_cover=${clearCover}`, { method: 'DELETE' })

export const linkProjectPrint = (projectId: number, data: { job_id: string; project_file_id?: number }) =>
  req<ProjectPrint>(`/api/projects/${projectId}/prints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const unlinkProjectPrint = (projectId: number, jobId: string) =>
  fetch(`/api/projects/${projectId}/prints/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  })

export const refreshProjectPrint = (projectId: number, jobId: string) =>
  req<ProjectPrint>(`/api/projects/${projectId}/prints/${encodeURIComponent(jobId)}/refresh`, {
    method: 'PATCH',
  })

// Print jobs
export const getPrintJob = (jobId: string) =>
  req<PrintJob & { photos: PrintPhoto[] } & Partial<PrintRecord>>(`/api/prints/${encodeURIComponent(jobId)}`)

export const updatePrintJob = (jobId: string, data: Partial<Pick<PrintJob, 'notes' | 'settings'>>) =>
  req<PrintJob>(`/api/prints/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const getPrintPhotos = (jobId: string) => req<PrintPhoto[]>(`/api/prints/${encodeURIComponent(jobId)}/photos`)

export const uploadPrintPhoto = (jobId: string, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return req<PrintPhoto>(`/api/prints/${encodeURIComponent(jobId)}/photos`, { method: 'POST', body: fd })
}

export const deletePrintPhoto = (jobId: string, photoId: number) =>
  fetch(`/api/prints/${encodeURIComponent(jobId)}/photos/${photoId}`, { method: 'DELETE' })

// Temperatures
export const getTemperatureHistory = () =>
  req<{ samples: TemperatureSample[] }>('/api/temperatures/history').then((history) => history.samples)
