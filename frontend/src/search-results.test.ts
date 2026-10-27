import { describe, expect, it } from 'vitest'
import { buildSearchGroups, findSearchResultPath, parseSearchQuery } from './search-results'
import type { SearchPayload } from './search-results'

describe('parsing a search query', () => {
  it('searches everything for plain text', () => {
    expect(parseSearchQuery('  blade ')).toEqual({ scope: 'all', text: 'blade' })
  })

  it('narrows to prints, spools or projects with a prefix', () => {
    expect(parseSearchQuery('!h blade')).toEqual({ scope: 'h', text: 'blade' })
    expect(parseSearchQuery('!s eSUN')).toEqual({ scope: 's', text: 'eSUN' })
    expect(parseSearchQuery('!p door')).toEqual({ scope: 'p', text: 'door' })
  })

  it('has no text while only the prefix is typed', () => {
    expect(parseSearchQuery('!p')).toEqual({ scope: 'all', text: '' })
  })
})

describe('building search groups', () => {
  const payload: SearchPayload = {
    history: [{ job_id: 'job-1', filename: 'blade.gcode', time: 1780000000 }],
    spools: [{ id: 2, brand: 'eSUN', material: 'PLA', color: 'Black' }],
    projects: [{ id: 3, name: 'Doorhandle', print_count: 2 }],
  }

  it('lists prints, projects and spools in that order, each with a title', () => {
    const groups = buildSearchGroups(payload)
    expect(groups.map((group) => group.title)).toEqual(['Prints', 'Projects', 'Spools'])
  })

  it('describes each result', () => {
    const [prints, projects, spools] = buildSearchGroups(payload)
    expect(prints.results[0]).toMatchObject({ label: 'blade.gcode', detail: '28 May', path: '/prints/job-1' })
    expect(projects.results[0]).toMatchObject({ label: 'Doorhandle', detail: '2 prints', path: '/projects/3' })
    expect(spools.results[0]).toMatchObject({ label: 'eSUN PLA', detail: 'Black', path: '/spools' })
  })

  it('leaves out groups without results', () => {
    expect(buildSearchGroups({ history: [], spools: [], projects: [] })).toEqual([])
  })

  it('finds the path of the result under a flat position', () => {
    const groups = buildSearchGroups(payload)
    expect(findSearchResultPath(groups, 0)).toBe('/prints/job-1')
    expect(findSearchResultPath(groups, 2)).toBe('/spools')
    expect(findSearchResultPath(groups, 9)).toBeNull()
  })
})
