import type { PrintRecord } from './types'

export type PrintSort = 'newest' | 'oldest' | 'highest-cost' | 'longest'

export interface PrintFilters {
  fileName: string
  /** a spool id, 'none' for prints without a spool, or '' for every print */
  spoolId: string
  /** a project id, 'none' for prints without a project, or '' for every print */
  projectId: string
  status: string
}

const NO_VALUE = '—'
const NONE = 'none'
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_MINUTE = 60

export function formatPrintDate(isoTime: string | null): string {
  if (!isoTime) return NO_VALUE
  return new Date(isoTime).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatPrintDuration(seconds: number): string {
  const hours = Math.floor(seconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  return `${hours}h ${minutes}m`
}

export function formatPrintFilament(grams: number): string {
  return `${grams.toFixed(1)} g`
}

export function formatPrintCost(cost: number | null): string {
  if (cost === null) return NO_VALUE
  return `€${cost.toFixed(2)}`
}

function matchesFileName(record: PrintRecord, fileName: string): boolean {
  return record.filename.toLowerCase().includes(fileName.toLowerCase())
}

function matchesSpool(record: PrintRecord, spoolId: string): boolean {
  if (spoolId === '') return true
  if (spoolId === NONE) return record.spool === null
  return String(record.spool?.id) === spoolId
}

function matchesProject(record: PrintRecord, projectId: string): boolean {
  if (projectId === '') return true
  if (projectId === NONE) return !record.project
  return String(record.project?.id) === projectId
}

function matchesStatus(record: PrintRecord, status: string): boolean {
  return status === '' || record.status === status
}

export function filterPrints(records: PrintRecord[], filters: PrintFilters): PrintRecord[] {
  return records.filter(
    (record) =>
      matchesFileName(record, filters.fileName) &&
      matchesSpool(record, filters.spoolId) &&
      matchesProject(record, filters.projectId) &&
      matchesStatus(record, filters.status),
  )
}

function readTime(record: PrintRecord): number {
  return record.time ? new Date(record.time).getTime() : 0
}

const COMPARISONS: Record<PrintSort, (first: PrintRecord, second: PrintRecord) => number> = {
  newest: (first, second) => readTime(second) - readTime(first),
  oldest: (first, second) => readTime(first) - readTime(second),
  'highest-cost': (first, second) => (second.cost_total ?? 0) - (first.cost_total ?? 0),
  longest: (first, second) => second.duration_s - first.duration_s,
}

export function sortPrints(records: PrintRecord[], sort: PrintSort): PrintRecord[] {
  return [...records].sort(COMPARISONS[sort])
}
