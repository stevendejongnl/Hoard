export type SearchScope = 'all' | 'h' | 's' | 'p'

export interface SearchQuery {
  scope: SearchScope
  text: string
}

export interface SearchPayload {
  history?: { job_id: string; filename: string; time?: number | null }[]
  spools?: { id: number; brand: string; material: string; color: string }[]
  projects?: { id: number; name: string; print_count: number }[]
}

export interface SearchResult {
  label: string
  detail: string
  path: string
}

export interface SearchGroup {
  title: string
  results: SearchResult[]
}

const SCOPE_PREFIXES: Record<string, SearchScope> = { '!h ': 'h', '!s ': 's', '!p ': 'p' }
const PREFIX_ONLY = /^![hsp]$/
const PREFIX_LENGTH = 3

export function parseSearchQuery(raw: string): SearchQuery {
  const trimmed = raw.trim()
  const scope = SCOPE_PREFIXES[trimmed.slice(0, PREFIX_LENGTH)]
  if (scope) return { scope, text: trimmed.slice(PREFIX_LENGTH).trim() }
  if (PREFIX_ONLY.test(trimmed)) return { scope: 'all', text: '' }
  return { scope: 'all', text: trimmed }
}

function formatSeconds(seconds: number | null | undefined): string {
  if (!seconds) return ''
  return new Date(seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function buildPrintGroup(payload: SearchPayload): SearchGroup {
  return {
    title: 'Prints',
    results: (payload.history ?? []).map((print) => ({
      label: print.filename,
      detail: formatSeconds(print.time),
      path: `/prints/${encodeURIComponent(print.job_id)}`,
    })),
  }
}

function buildProjectGroup(payload: SearchPayload): SearchGroup {
  return {
    title: 'Projects',
    results: (payload.projects ?? []).map((project) => ({
      label: project.name,
      detail: `${project.print_count} prints`,
      path: `/projects/${project.id}`,
    })),
  }
}

function buildSpoolGroup(payload: SearchPayload): SearchGroup {
  return {
    title: 'Spools',
    results: (payload.spools ?? []).map((spool) => ({
      label: `${spool.brand} ${spool.material}`,
      detail: spool.color,
      path: '/spools',
    })),
  }
}

export function buildSearchGroups(payload: SearchPayload): SearchGroup[] {
  return [buildPrintGroup(payload), buildProjectGroup(payload), buildSpoolGroup(payload)].filter(
    (group) => group.results.length > 0,
  )
}

export function findSearchResultPath(groups: SearchGroup[], position: number): string | null {
  return groups.flatMap((group) => group.results)[position]?.path ?? null
}
