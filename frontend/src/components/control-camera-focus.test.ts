import { afterEach, describe, expect, it } from 'vitest'
import './control-camera-focus'
import type { ControlCameraFocus } from './control-camera-focus'
import { IDLE_STATUS, findButton } from './control-card-testing'
import type { ControlStatus } from '../types'

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(status: ControlStatus | null = IDLE_STATUS, locked = false) {
  const sent: Array<{ route: string; body: object }> = []
  const focus = document.createElement('control-camera-focus') as ControlCameraFocus
  focus.status = status
  focus.locked = locked
  focus.send = async (route, body) => void sent.push({ route, body })
  let closed = 0
  focus.addEventListener('control-camera-focus-close', () => (closed += 1))
  document.body.appendChild(focus)
  await focus.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { focus, sent, closed: () => closed }
}

describe('the camera on a screen of its own', () => {
  it('is a dialog with the camera, the move controls and the Z babystep', async () => {
    const { focus } = await mount()
    expect(focus.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Camera with controls')
    expect(focus.querySelector('camera-panel')).not.toBeNull()
    expect(focus.querySelector('control-move-card')).not.toBeNull()
    expect(focus.querySelector('.control-focus-babystep control-z-offset')).not.toBeNull()
  })

  it('closes with its button and with Escape', async () => {
    const { focus, closed } = await mount()
    findButton(focus, 'Close the camera').click()
    expect(closed()).toBe(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closed()).toBe(2)
  })

  it('stops listening for Escape once it is gone', async () => {
    const { focus, closed } = await mount()
    focus.remove()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closed()).toBe(0)
  })

  it('moves the head with the pad, and nudges the Z offset', async () => {
    const { focus, sent } = await mount()
    findButton(focus, 'X plus').click()
    findButton(focus, 'Raise 0.05').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent.map((command) => command.route)).toEqual(['move', 'babystep'])
  })

  it('keeps the Z babystep during a print and locks the pad', async () => {
    const { focus, sent } = await mount(IDLE_STATUS, true)
    expect(findButton(focus, 'X plus').disabled).toBe(true)
    expect(findButton(focus, 'Raise 0.05').disabled).toBe(false)
    findButton(focus, 'Raise 0.05').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent.map((command) => command.route)).toEqual(['babystep'])
  })

  it('shows the Z offset it nudges', async () => {
    const { focus } = await mount()
    expect(focus.textContent).toContain('-0.120 mm')
  })
})
