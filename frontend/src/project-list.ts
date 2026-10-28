import type { Project } from './types'

export type ProjectSortOrder = 'recent' | 'name' | 'prints' | 'cost'

export interface ProjectTotals {
  projectCount: number
  printCount: number
  filamentGrams: number
  cost: number
}

export const PROJECT_SORT_LABELS: Record<ProjectSortOrder, string> = {
  recent: 'Recently printed',
  name: 'Name',
  prints: 'Most prints',
  cost: 'Highest cost',
}

const NOTHING_TO_SHOW = '—'
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

export function formatDuration(seconds: number | null): string {
  if (!seconds) return NOTHING_TO_SHOW
  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE)
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const minutes = totalMinutes % MINUTES_PER_HOUR
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export function formatFilament(grams: number | null): string {
  if (grams === null) return NOTHING_TO_SHOW
  return `${grams.toFixed(1)} g`
}

export function formatCost(cost: number | null): string {
  if (cost === null) return NOTHING_TO_SHOW
  return `€${cost.toFixed(2)}`
}

export function filterProjectsByName(projects: Project[], query: string): Project[] {
  const trimmedQuery = query.trim().toLowerCase()
  if (trimmedQuery === '') return projects
  return projects.filter((project) => project.name.toLowerCase().includes(trimmedQuery))
}

function compareByName(first: Project, second: Project): number {
  return first.name.localeCompare(second.name)
}

function compareByPrintCount(first: Project, second: Project): number {
  return second.print_count - first.print_count
}

function compareByCost(first: Project, second: Project): number {
  return (second.total_cost ?? -1) - (first.total_cost ?? -1)
}

const COMPARISONS: Record<ProjectSortOrder, ((first: Project, second: Project) => number) | null> = {
  recent: null,
  name: compareByName,
  prints: compareByPrintCount,
  cost: compareByCost,
}

/** The server already lists projects by most recent print, so that order is kept as it is. */
export function sortProjects(projects: Project[], order: ProjectSortOrder): Project[] {
  const comparison = COMPARISONS[order]
  if (comparison === null) return [...projects]
  return [...projects].sort(comparison)
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100
}

function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10
}

export function calculateProjectTotals(projects: Project[]): ProjectTotals {
  const printCount = projects.reduce((sum, project) => sum + project.print_count, 0)
  const filamentGrams = projects.reduce((sum, project) => sum + (project.total_filament_g ?? 0), 0)
  const cost = projects.reduce((sum, project) => sum + (project.total_cost ?? 0), 0)
  return {
    projectCount: projects.length,
    printCount,
    filamentGrams: roundToTenths(filamentGrams),
    cost: roundToCents(cost),
  }
}
