import { afterEach, describe, expect, it } from 'vitest'
import './top-navigation'
import type { TopNavigation } from './top-navigation'

const CONFIRMATION_MESSAGE = 'Emergency stop? This will halt all motion immediately.'
const FAILURE_MESSAGE = 'Emergency stop failed. Check the printer connection.'

interface Calls {
  confirmations: string[]
  stops: number
  failures: string[]
}

async function createTopNavigation(options: { confirmation: boolean; stopFails?: boolean }) {
  const calls: Calls = { confirmations: [], stops: 0, failures: [] }
  const element = document.createElement('top-navigation') as TopNavigation
  element.confirmEmergencyStop = (message) => {
    calls.confirmations.push(message)
    return options.confirmation
  }
  element.stopEmergency = async () => {
    calls.stops += 1
    if (options.stopFails) throw new Error('printer unreachable')
  }
  element.reportFailure = (message) => calls.failures.push(message)
  document.body.appendChild(element)
  await element.updateComplete
  const button = element.querySelector('button.emergency-stop') as HTMLButtonElement
  return { button, calls }
}

async function clickAndSettle(button: HTMLButtonElement): Promise<void> {
  button.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('emergency stop button', () => {
  it('is always available and named for screen readers', async () => {
    const { button } = await createTopNavigation({ confirmation: true })
    expect(button).not.toBeNull()
    expect(button.getAttribute('aria-label')).toBe('Emergency stop')
    expect(button.textContent).toContain('Emergency stop')
  })

  it('asks for confirmation first', async () => {
    const { button, calls } = await createTopNavigation({ confirmation: false })
    await clickAndSettle(button)
    expect(calls.confirmations).toEqual([CONFIRMATION_MESSAGE])
  })

  it('does not stop anything when the confirmation is declined', async () => {
    const { button, calls } = await createTopNavigation({ confirmation: false })
    await clickAndSettle(button)
    expect(calls.stops).toBe(0)
  })

  it('stops the printer once when the confirmation is accepted', async () => {
    const { button, calls } = await createTopNavigation({ confirmation: true })
    await clickAndSettle(button)
    expect(calls.stops).toBe(1)
    expect(calls.failures).toEqual([])
  })

  it('tells the user when stopping fails', async () => {
    const { button, calls } = await createTopNavigation({ confirmation: true, stopFails: true })
    await clickAndSettle(button)
    expect(calls.failures).toEqual([FAILURE_MESSAGE])
  })
})
