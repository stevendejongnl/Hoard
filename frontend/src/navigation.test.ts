import { describe, expect, it } from 'vitest'
import { NAVIGATION_ITEMS, findNavigationSection, followNavigationLink } from './navigation'

describe('NAVIGATION_ITEMS', () => {
  it('lists the five sections in order with their paths and labels', () => {
    expect(NAVIGATION_ITEMS).toEqual([
      { section: 'dashboard', path: '/', label: 'Dashboard' },
      { section: 'history', path: '/history', label: 'History' },
      { section: 'projects', path: '/projects', label: 'Projects' },
      { section: 'spools', path: '/spools', label: 'Spools' },
      { section: 'system', path: '/system', label: 'System' },
    ])
  })
})

describe('findNavigationSection', () => {
  it.each([
    ['/', 'dashboard'],
    ['/history', 'history'],
    ['/prints/job-005', 'history'],
    ['/projects', 'projects'],
    ['/projects/1', 'projects'],
    ['/spools', 'spools'],
    ['/something-unknown', 'dashboard'],
  ])('maps %s to %s', (route, section) => {
    expect(findNavigationSection(route)).toBe(section)
  })
})

describe('followNavigationLink', () => {
  function createClick(options: MouseEventInit = {}): MouseEvent {
    return new MouseEvent('click', { cancelable: true, ...options })
  }

  it('navigates without reloading the page on a plain click', () => {
    const visitedPaths: string[] = []
    const click = createClick()
    followNavigationLink(click, '/history', (path) => visitedPaths.push(path))
    expect(visitedPaths).toEqual(['/history'])
    expect(click.defaultPrevented).toBe(true)
  })

  it.each([
    ['control', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['middle button', { button: 1 }],
  ])('leaves a %s click to the browser', (_name, options) => {
    const visitedPaths: string[] = []
    const click = createClick(options)
    followNavigationLink(click, '/history', (path) => visitedPaths.push(path))
    expect(visitedPaths).toEqual([])
    expect(click.defaultPrevented).toBe(false)
  })
})
