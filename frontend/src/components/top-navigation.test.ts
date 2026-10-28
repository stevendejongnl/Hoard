import { afterEach, describe, expect, it } from 'vitest'
import './top-navigation'
import type { TopNavigation } from './top-navigation'

async function createTopNavigation(properties: Partial<TopNavigation> = {}): Promise<TopNavigation> {
  const element = document.createElement('top-navigation') as TopNavigation
  Object.assign(element, properties)
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

function findTabs(element: TopNavigation): HTMLAnchorElement[] {
  return [...element.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Primary"] a')]
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('top navigation brand', () => {
  it('links to the dashboard and names the app', async () => {
    const brand = (await createTopNavigation()).querySelector<HTMLAnchorElement>('a.brand')
    expect(brand?.getAttribute('href')).toBe('/')
    expect(brand?.textContent).toContain('Hoard')
  })

  it('shows the mark next to the name, hidden from screen readers', async () => {
    const mark = (await createTopNavigation()).querySelector('a.brand svg')
    expect(mark?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('top navigation tabs', () => {
  it('lists the four sections as links in order', async () => {
    const tabs = findTabs(await createTopNavigation())
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Dashboard', 'History', 'Projects', 'Spools'])
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual(['/', '/history', '/projects', '/spools'])
  })

  it.each([
    ['/', 'Dashboard'],
    ['/history', 'History'],
    ['/prints/job-001', 'History'],
    ['/projects/1', 'Projects'],
    ['/spools', 'Spools'],
  ])('marks the tab for %s as the current page: %s', async (route, label) => {
    const tabs = findTabs(await createTopNavigation({ route }))
    const currentLabels = tabs
      .filter((tab) => tab.getAttribute('aria-current') === 'page')
      .map((tab) => tab.textContent?.trim())
    expect(currentLabels).toEqual([label])
  })

  it('navigates through the injected function without reloading the page', async () => {
    const visitedPaths: string[] = []
    const element = await createTopNavigation({ navigate: (path) => visitedPaths.push(path) })
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    findTabs(element)[1].dispatchEvent(click)
    expect(visitedPaths).toEqual(['/history'])
    expect(click.defaultPrevented).toBe(true)
  })

  it('updates the current tab when the route changes', async () => {
    const element = await createTopNavigation({ route: '/' })
    element.route = '/spools'
    await element.updateComplete
    const current = findTabs(element).find((tab) => tab.getAttribute('aria-current') === 'page')
    expect(current?.textContent?.trim()).toBe('Spools')
  })
})

describe('top bar bell', () => {
  it('sits before the emergency stop, inside the actions', async () => {
    const bar = document.createElement('top-navigation')
    document.body.appendChild(bar)
    await bar.updateComplete
    const actions = bar.querySelector('.top-navigation-actions')!
    const children = [...actions.children].map((child) => child.tagName.toLowerCase())
    expect(children.indexOf('push-toggle')).toBeGreaterThan(-1)
    expect(children.indexOf('push-toggle')).toBeLessThan(children.indexOf('button', children.indexOf('push-toggle')))
  })
})
