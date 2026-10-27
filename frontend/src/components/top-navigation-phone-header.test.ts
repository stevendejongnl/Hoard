import { afterEach, describe, expect, it } from 'vitest'
import './top-navigation'
import type { TopNavigation } from './top-navigation'

async function createTopNavigation(properties: Partial<TopNavigation>): Promise<TopNavigation> {
  const element = document.createElement('top-navigation') as TopNavigation
  Object.assign(element, properties)
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('top navigation on phone', () => {
  it('keeps the app name on desktop and adds the page title for phone', async () => {
    const element = await createTopNavigation({ route: '/history' })
    expect(element.querySelector('.brand-name')?.textContent).toBe('Hoard')
    expect(element.querySelector('.phone-title')?.textContent).toBe('History')
  })

  it('has no back link on a top level page', async () => {
    expect((await createTopNavigation({ route: '/spools' })).querySelector('.phone-back')).toBeNull()
  })

  it('has a back link to the project list on a project', async () => {
    const back = (await createTopNavigation({ route: '/projects/1' })).querySelector<HTMLAnchorElement>('.phone-back')
    expect(back?.getAttribute('href')).toBe('/projects')
    expect(back?.getAttribute('aria-label')).toBe('Back to Projects')
  })

  it('sends the back link through the injected navigate function', async () => {
    const visitedPaths: string[] = []
    const element = await createTopNavigation({ route: '/projects/1', navigate: (path) => visitedPaths.push(path) })
    element.querySelector<HTMLAnchorElement>('.phone-back')?.click()
    expect(visitedPaths).toEqual(['/projects'])
  })

  it('has a search button with an accessible name', async () => {
    const button = (await createTopNavigation({})).querySelector<HTMLButtonElement>('button.search-button')
    expect(button?.getAttribute('aria-label')).toBe('Search')
  })
})
