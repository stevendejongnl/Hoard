import { describe, expect, it } from 'vitest'
import {
  calculateProjectTotals,
  filterProjectsByName,
  formatCost,
  formatDuration,
  formatFilament,
  sortProjects,
} from './project-list'
import type { Project } from './types'

function createProject(overrides: Partial<Project>): Project {
  return {
    id: 1,
    name: 'Project',
    notes: null,
    created_at: 0,
    print_count: 0,
    total_duration_s: null,
    avg_duration_s: null,
    max_duration_s: null,
    total_cost: null,
    avg_cost: null,
    total_filament_g: null,
    ...overrides,
  }
}

const DACTYL = createProject({
  id: 1,
  name: 'Dactyl Manuform',
  print_count: 2,
  total_cost: 0.86,
  total_filament_g: 86.6,
})
const DOORHANDLE = createProject({
  id: 2,
  name: 'Doorhandle',
  print_count: 5,
  total_cost: 1.9,
  total_filament_g: 126.5,
})
const VORON = createProject({ id: 3, name: 'Voron 2.4' })

describe('formatDuration', () => {
  it('shows hours and minutes', () => expect(formatDuration(21480)).toBe('5h 58m'))
  it('shows only minutes under an hour', () => expect(formatDuration(900)).toBe('15m'))
  it('shows a dash when there is no time', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(0)).toBe('—')
  })
})

describe('formatFilament', () => {
  it('shows one decimal and the unit', () => expect(formatFilament(86.6)).toBe('86.6 g'))
  it('shows a dash when there is no filament', () => expect(formatFilament(null)).toBe('—'))
})

describe('formatCost', () => {
  it('shows euros with two decimals', () => expect(formatCost(0.86)).toBe('€0.86'))
  it('shows zero cost as a cost', () => expect(formatCost(0)).toBe('€0.00'))
  it('shows a dash when there is no cost', () => expect(formatCost(null)).toBe('—'))
})

describe('filterProjectsByName', () => {
  it('keeps every project for an empty query', () => {
    expect(filterProjectsByName([DACTYL, VORON], '  ')).toEqual([DACTYL, VORON])
  })
  it('keeps projects whose name contains the query, ignoring case', () => {
    expect(filterProjectsByName([DACTYL, DOORHANDLE, VORON], 'DOOR')).toEqual([DOORHANDLE])
  })
  it('keeps nothing when no name matches', () => {
    expect(filterProjectsByName([DACTYL], 'xyz')).toEqual([])
  })
})

describe('sortProjects', () => {
  const projects = [VORON, DOORHANDLE, DACTYL]

  it('keeps the order of the server for recently printed', () => {
    expect(sortProjects(projects, 'recent')).toEqual([VORON, DOORHANDLE, DACTYL])
  })
  it('sorts by name', () => {
    expect(sortProjects(projects, 'name')).toEqual([DACTYL, DOORHANDLE, VORON])
  })
  it('sorts by most prints first', () => {
    expect(sortProjects(projects, 'prints')).toEqual([DOORHANDLE, DACTYL, VORON])
  })
  it('sorts by highest cost first, projects without cost last', () => {
    expect(sortProjects(projects, 'cost')).toEqual([DOORHANDLE, DACTYL, VORON])
  })
  it('does not change the list it is given', () => {
    sortProjects(projects, 'name')
    expect(projects).toEqual([VORON, DOORHANDLE, DACTYL])
  })
})

describe('calculateProjectTotals', () => {
  it('adds up projects, prints, filament and cost', () => {
    expect(calculateProjectTotals([DACTYL, DOORHANDLE, VORON])).toEqual({
      projectCount: 3,
      printCount: 7,
      filamentGrams: 213.1,
      cost: 2.76,
    })
  })
  it('is all zero without projects', () => {
    expect(calculateProjectTotals([])).toEqual({ projectCount: 0, printCount: 0, filamentGrams: 0, cost: 0 })
  })
})
