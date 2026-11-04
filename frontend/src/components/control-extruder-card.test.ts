import { afterEach, describe, expect, it } from 'vitest'
import './control-extruder-card'
import type { ControlExtruderCard } from './control-extruder-card'
import { findButton, listButtonLabels, mountCard, press } from './control-card-testing'

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(options = {}) {
  return mountCard<ControlExtruderCard>('control-extruder-card', options)
}

describe('the extruder card', () => {
  it('has the lengths, the speeds, retract and extrude, and load and unload', async () => {
    const { card } = await mount()
    expect(listButtonLabels(card)).toEqual([
      '5',
      '10',
      '25',
      '50',
      '2',
      '5',
      '10',
      'Retract',
      'Extrude',
      'Load filament',
      'Unload',
    ])
  })

  it('extrudes ten millimetres at five millimetres a second to begin with', async () => {
    const { card, sent } = await mount()
    await press(card, 'Extrude')
    expect(sent).toEqual([{ route: 'extrude', body: { length: 10, speed: 300 } }])
  })

  it('retracts with a negative length', async () => {
    const { card, sent } = await mount()
    await press(card, 'Retract')
    expect(sent).toEqual([{ route: 'extrude', body: { length: -10, speed: 300 } }])
  })

  it('uses the length and the speed that are chosen, and marks them', async () => {
    const { card, sent } = await mount()
    const lengths = card.querySelector('[data-group="length"]') as HTMLElement
    const speeds = card.querySelector('[data-group="speed"]') as HTMLElement
    findButton(lengths, '25').click()
    findButton(speeds, '10').click()
    await card.updateComplete
    expect(findButton(lengths, '25').getAttribute('aria-pressed')).toBe('true')
    expect(findButton(speeds, '10').getAttribute('aria-pressed')).toBe('true')
    await press(card, 'Extrude')
    expect(sent).toEqual([{ route: 'extrude', body: { length: 25, speed: 600 } }])
  })

  it('loads and unloads filament with the macros the printer has for it', async () => {
    const { card, sent } = await mount()
    await press(card, 'Load filament')
    await press(card, 'Unload')
    expect(sent).toEqual([
      { route: 'macro', body: { name: 'LOAD_FILAMENT' } },
      { route: 'macro', body: { name: 'UNLOAD_FILAMENT' } },
    ])
  })

  it('has everything that moves the filament locked while printing', async () => {
    const { card, sent } = await mount({ locked: true })
    const actions = ['Retract', 'Extrude', 'Load filament', 'Unload']
    expect(actions.every((label) => findButton(card, label).disabled)).toBe(true)
    await press(card, 'Extrude')
    expect(sent).toEqual([])
    expect(card.textContent).toContain('Locked while the printer is printing')
  })
})
