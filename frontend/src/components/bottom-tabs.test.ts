import { afterEach, describe, expect, it } from 'vitest'
import './bottom-tabs'
import type { BottomTabs } from './bottom-tabs'

async function createBottomTabs(properties: Partial<BottomTabs> = {}): Promise<BottomTabs> {
  const element = document.createElement('bottom-tabs') as BottomTabs
  Object.assign(element, properties)
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

function findTabs(element: BottomTabs): HTMLAnchorElement[] {
  return [...element.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Primary"] a')]
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('bottom tabs', () => {
  it('lists the five sections as links in order, each with an icon and a label', async () => {
    const tabs = findTabs(await createBottomTabs())
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Dashboard', 'History', 'Projects', 'Spools', 'System'])
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual(['/', '/history', '/projects', '/spools', '/system'])
    expect(tabs.every((tab) => tab.querySelector('svg[aria-hidden="true"]') !== null)).toBe(true)
  })

  it.each([
    ['/', 'Dashboard'],
    ['/history', 'History'],
    ['/prints/job-001', 'History'],
    ['/projects/1', 'Projects'],
    ['/spools', 'Spools'],
  ])('marks the tab for %s as the current page: %s', async (route, label) => {
    const tabs = findTabs(await createBottomTabs({ route }))
    const currentLabels = tabs
      .filter((tab) => tab.getAttribute('aria-current') === 'page')
      .map((tab) => tab.textContent?.trim())
    expect(currentLabels).toEqual([label])
  })

  it('navigates through the injected function without reloading the page', async () => {
    const visitedPaths: string[] = []
    const element = await createBottomTabs({ navigate: (path) => visitedPaths.push(path) })
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    findTabs(element)[3].dispatchEvent(click)
    expect(visitedPaths).toEqual(['/spools'])
    expect(click.defaultPrevented).toBe(true)
  })

  it('updates the current tab when the route changes', async () => {
    const element = await createBottomTabs({ route: '/' })
    element.route = '/history'
    await element.updateComplete
    const current = findTabs(element).find((tab) => tab.getAttribute('aria-current') === 'page')
    expect(current?.textContent?.trim()).toBe('History')
  })
})
