import type { GcodeFile, PredictResult, PrintRecord, Spool } from './types'

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, opts)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

// Files
export const getFiles = () => req<GcodeFile[]>('/api/files')
export const getFileMetadata = (filename: string) =>
  req<GcodeFile>(`/api/files/metadata?filename=${encodeURIComponent(filename)}`)
export const uploadFile = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return req<{ item: { path: string } }>('/api/files/upload', { method: 'POST', body: fd })
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

// Spools
export const getSpools = () => req<Spool[]>('/api/spools')
export const createSpool = (data: Partial<Spool>) =>
  req<Spool>('/api/spools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
export const updateSpool = (id: number, data: Partial<Spool>) =>
  req<Spool>(`/api/spools/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
export const deleteSpool = (id: number) =>
  fetch(`/api/spools/${id}`, { method: 'DELETE' })

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
