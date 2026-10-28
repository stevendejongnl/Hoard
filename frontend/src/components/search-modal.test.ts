import { afterEach, describe, expect, it } from 'vitest'
import type { SearchPayload } from '../search-results'
import './search-modal'
import type { SearchModal } from './search-modal'

const payload: SearchPayload = {
  history: [{ job_id: 'job-1', filename: 'blade.gcode', time: 1780000000 }],
  spools: [{ id: 2, brand: 'eSUN', material: 'PLA', color: 'Black' }],
  projects: [{ id: 3, name: 'Doorhandle', print_count: 2 }],
}

interface Calls {
  searches: { text: string; scope: string }[]
  visited: string[]
}

async function createModal(calls: Calls, properties: Partial<SearchModal> = {}): Promise<SearchModal> {
  const modal = document.createElement('search-modal') as SearchModal
  modal.runSearch = async (text, scope) => {
    calls.searches.push({ text, scope })
    return payload
  }
  modal.navigate = (path) => void calls.visited.push(path)
  modal.debounceMilliseconds = 0
  Object.assign(modal, properties)
  document.body.appendChild(modal)
  await modal.updateComplete
  return modal
}

function createCalls(): Calls {
  return { searches: [], visited: [] }
}

async function typeQuery(modal: SearchModal, text: string): Promise<void> {
  const input = modal.querySelector<HTMLInputElement>('input.search-input')!
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 10))
  await modal.updateComplete
}

async function press(modal: SearchModal, key: string): Promise<void> {
  modal.querySelector('input.search-input')?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  await modal.updateComplete
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('opening and closing', () => {
  it('is closed to begin with', async () => {
    const modal = await createModal(createCalls())
    expect(modal.querySelector('.search-overlay.open')).toBeNull()
  })

  it('opens from code and puts the cursor in the field', async () => {
    const modal = await createModal(createCalls())
    modal.open()
    await modal.updateComplete
    expect(modal.querySelector('.search-overlay.open')).not.toBeNull()
    expect(document.activeElement).toBe(modal.querySelector('input.search-input'))
  })

  it('opens when the slash key is pressed outside a field', async () => {
    const modal = await createModal(createCalls())
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    await modal.updateComplete
    expect(modal.querySelector('.search-overlay.open')).not.toBeNull()
  })

  it('closes with Escape and when the backdrop is pressed', async () => {
    const modal = await createModal(createCalls())
    modal.open()
    await modal.updateComplete
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await modal.updateComplete
    expect(modal.querySelector('.search-overlay.open')).toBeNull()
    modal.open()
    await modal.updateComplete
    modal.querySelector<HTMLElement>('.search-overlay')?.click()
    await modal.updateComplete
    expect(modal.querySelector('.search-overlay.open')).toBeNull()
  })

  it('stops listening to the keyboard when removed', async () => {
    const modal = await createModal(createCalls())
    modal.remove()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    await modal.updateComplete
    expect(modal.querySelector('.search-overlay.open')).toBeNull()
  })
})

describe('searching', () => {
  it('shows a hint before anything is typed', async () => {
    const modal = await createModal(createCalls())
    modal.open()
    await modal.updateComplete
    expect(modal.querySelector('.search-hint')?.textContent).toContain('!p')
  })

  it('shows grouped results with their titles', async () => {
    const modal = await createModal(createCalls())
    modal.open()
    await typeQuery(modal, 'door')
    const titles = [...modal.querySelectorAll('.search-group-title')].map((title) => title.textContent)
    expect(titles).toEqual(['Prints', 'Projects', 'Spools'])
    expect(modal.querySelectorAll('.search-result').length).toBe(3)
  })

  it('narrows the scope with a prefix', async () => {
    const calls = createCalls()
    const modal = await createModal(calls)
    modal.open()
    await typeQuery(modal, '!p door')
    expect(calls.searches).toEqual([{ text: 'door', scope: 'p' }])
  })

  it('says so when nothing is found', async () => {
    const modal = await createModal(createCalls(), {
      runSearch: async () => ({ history: [], spools: [], projects: [] }),
    })
    modal.open()
    await typeQuery(modal, 'zzz')
    expect(modal.querySelector('.search-hint')?.textContent).toBe('No results for "zzz"')
  })

  it('says so when the search fails', async () => {
    const modal = await createModal(createCalls(), {
      runSearch: async () => {
        throw new Error('offline')
      },
    })
    modal.open()
    await typeQuery(modal, 'zzz')
    expect(modal.querySelector('.search-hint')?.textContent).toBe('Search is not available right now')
  })
})

describe('choosing a result', () => {
  it('moves the cursor with the arrow keys and opens the chosen result with Enter', async () => {
    const calls = createCalls()
    const modal = await createModal(calls)
    modal.open()
    await typeQuery(modal, 'door')
    expect(modal.querySelector('.search-result.cursor')?.textContent).toContain('blade.gcode')
    await press(modal, 'ArrowDown')
    await press(modal, 'Enter')
    expect(calls.visited).toEqual(['/projects/3'])
    expect(modal.querySelector('.search-overlay.open')).toBeNull()
  })

  it('opens a result when it is clicked', async () => {
    const calls = createCalls()
    const modal = await createModal(calls)
    modal.open()
    await typeQuery(modal, 'door')
    modal.querySelectorAll<HTMLElement>('.search-result')[2].click()
    expect(calls.visited).toEqual(['/spools'])
  })

  it('keeps the cursor inside the list', async () => {
    const calls = createCalls()
    const modal = await createModal(calls)
    modal.open()
    await typeQuery(modal, 'door')
    await press(modal, 'ArrowUp')
    await press(modal, 'Enter')
    expect(calls.visited).toEqual(['/prints/job-1'])
  })
})
