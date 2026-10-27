import type { GcodeFile } from './types'

const BYTES_PER_KILOBYTE = 1024
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE

export function formatFileSize(bytes: number): string {
  if (bytes >= BYTES_PER_MEGABYTE) return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
  if (bytes >= BYTES_PER_KILOBYTE) return `${Math.round(bytes / BYTES_PER_KILOBYTE)} KB`
  return `${bytes} B`
}

export function filterFiles(files: GcodeFile[], text: string): GcodeFile[] {
  const lowered = text.toLowerCase()
  return files.filter((file) => file.filename.toLowerCase().includes(lowered))
}
