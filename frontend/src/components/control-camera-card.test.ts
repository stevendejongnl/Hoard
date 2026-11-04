import { afterEach, describe, expect, it } from 'vitest'
import './control-camera-card'
import type { ControlCameraCard } from './control-camera-card'
import { findButton, mountCard } from './control-card-testing'

afterEach(() => {
  document.body.replaceChildren()
})

describe('the camera card', () => {
  it('shows the live camera under the title Camera', async () => {
    const { card } = await mountCard<ControlCameraCard>('control-camera-card')
    expect(card.querySelector('.control-card-header')?.textContent).toContain('Camera')
    expect(card.querySelector('camera-panel')).not.toBeNull()
  })

  it('opens the camera with the move controls on a screen of its own', async () => {
    const { card } = await mountCard<ControlCameraCard>('control-camera-card')
    let opened = 0
    card.addEventListener('control-camera-focus', () => (opened += 1))
    findButton(card, 'Fullscreen camera with controls').click()
    expect(opened).toBe(1)
  })

  it('can be opened while printing, because it only looks and the Z babystep stays available', async () => {
    const { card } = await mountCard<ControlCameraCard>('control-camera-card', { locked: true })
    expect(findButton(card, 'Fullscreen camera with controls').disabled).toBe(false)
  })
})
