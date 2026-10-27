import { afterEach, describe, expect, it } from 'vitest'
import './top-navigation'
import type { TopNavigation } from './top-navigation'

async function createTopNavigation(printerState: string): Promise<TopNavigation> {
  const element = document.createElement('top-navigation') as TopNavigation
  element.printerState = printerState
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('printer state badge', () => {
  it.each(['printing', 'paused', 'error'])('shows the %s state', async (printerState) => {
    const badge = (await createTopNavigation(printerState)).querySelector('.state-badge')
    expect(badge?.textContent?.trim()).toBe(printerState)
  })

  it.each(['standby', 'complete', ''])('shows nothing for the %j state', async (printerState) => {
    expect((await createTopNavigation(printerState)).querySelector('.state-badge')).toBeNull()
  })

  it('marks a paused print with its own style', async () => {
    const badge = (await createTopNavigation('paused')).querySelector('.state-badge')
    expect(badge?.classList.contains('paused')).toBe(true)
  })

  it('marks an error with its own style', async () => {
    const badge = (await createTopNavigation('error')).querySelector('.state-badge')
    expect(badge?.classList.contains('error')).toBe(true)
  })

  it('does not give a normal print a variant style', async () => {
    const badge = (await createTopNavigation('printing')).querySelector('.state-badge')
    expect(badge?.classList.contains('paused')).toBe(false)
    expect(badge?.classList.contains('error')).toBe(false)
  })

  it('pulses a dot next to the state, hidden from screen readers', async () => {
    const dot = (await createTopNavigation('printing')).querySelector('.state-badge .pulsing-dot')
    expect(dot?.getAttribute('aria-hidden')).toBe('true')
  })

  it('updates when the printer state changes', async () => {
    const element = await createTopNavigation('standby')
    element.printerState = 'printing'
    await element.updateComplete
    expect(element.querySelector('.state-badge')?.textContent?.trim()).toBe('printing')
  })
})
