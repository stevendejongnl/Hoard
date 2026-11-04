import { afterEach, describe, expect, it } from 'vitest'
import './control-macros-card'
import type { ControlMacrosCard } from './control-macros-card'
import { findButton, listButtonLabels, mountCard, press } from './control-card-testing'

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(loadMacros: () => Promise<string[]>, locked = false) {
  const { card, sent } = await mountCard<ControlMacrosCard>('control-macros-card', { locked })
  card.loadMacros = loadMacros
  card.connectedCallback()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await card.updateComplete
  return { card, sent }
}

describe('the macros card', () => {
  it('has a button for every macro of the printer', async () => {
    const { card } = await mount(async () => ['CLEAN_NOZZLE', 'PARK'])
    expect(listButtonLabels(card)).toEqual(['CLEAN_NOZZLE', 'PARK'])
  })

  it('runs a macro when its button is pressed', async () => {
    const { card, sent } = await mount(async () => ['CLEAN_NOZZLE'])
    await press(card, 'CLEAN_NOZZLE')
    expect(sent).toEqual([{ route: 'macro', body: { name: 'CLEAN_NOZZLE' } }])
  })

  it('says so when the printer has none', async () => {
    const { card } = await mount(async () => [])
    expect(card.textContent).toContain('No macros')
  })

  it('says so when they cannot be read', async () => {
    const { card } = await mount(async () => {
      throw new Error('offline')
    })
    expect(card.textContent).toContain('Could not read the macros')
  })

  it('has every macro locked while printing, and says why', async () => {
    const { card, sent } = await mount(async () => ['PARK'], true)
    expect(findButton(card, 'PARK').disabled).toBe(true)
    await press(card, 'PARK')
    expect(sent).toEqual([])
    expect(card.textContent).toContain('Locked while the printer is printing')
  })
})
