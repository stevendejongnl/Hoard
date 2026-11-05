import { afterEach, describe, expect, it } from 'vitest'
import './control-macros-card'
import type { ControlMacrosCard } from './control-macros-card'
import type { Macro } from '../types'
import { findButton, listButtonLabels, mountCard, press } from './control-card-testing'

afterEach(() => {
  document.body.replaceChildren()
})

const CLEAN: Macro = { name: 'CLEAN_NOZZLE', description: 'Wipe the nozzle on the brush', category: 'Calibrate' }
const PARK: Macro = { name: 'PARK', description: '', category: 'Printing' }
const LOOSE: Macro = { name: 'G29', description: '', category: '' }

async function mount(loadMacros: () => Promise<Macro[]>, locked = false) {
  const { card, sent } = await mountCard<ControlMacrosCard>('control-macros-card', { locked })
  card.loadMacros = loadMacros
  card.connectedCallback()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await card.updateComplete
  return { card, sent }
}

describe('the macros card', () => {
  it('has a row with a run button for every macro of the printer', async () => {
    const { card } = await mount(async () => [PARK, CLEAN])
    expect(listButtonLabels(card)).toEqual(['Run PARK', 'Run CLEAN_NOZZLE'])
  })

  it('shows the name of a macro and, when it has one, what it does', async () => {
    const { card } = await mount(async () => [CLEAN, PARK])
    const rows = [...card.querySelectorAll('.control-macro-row')]
    expect(rows[0].querySelector('.control-macro-name')?.textContent).toBe('CLEAN_NOZZLE')
    expect(rows[0].querySelector('.control-macro-description')?.textContent).toBe('Wipe the nozzle on the brush')
    expect(rows[1].querySelector('.control-macro-description')).toBeNull()
  })

  it('puts the macros under the heading of their category, in the order they come, and the rest under Other', async () => {
    const { card } = await mount(async () => [PARK, CLEAN, LOOSE])
    const headings = [...card.querySelectorAll('.control-macro-group-title')].map((title) => title.textContent)
    expect(headings).toEqual(['Printing', 'Calibrate', 'Other'])
    const second = card.querySelectorAll('.control-macro-group')[1]
    expect(second.querySelectorAll('.control-macro-row')).toHaveLength(1)
  })

  it('has no headings when no macro has a category', async () => {
    const { card } = await mount(async () => [LOOSE])
    expect(card.querySelector('.control-macro-group-title')).toBeNull()
    expect(card.querySelectorAll('.control-macro-row')).toHaveLength(1)
  })

  it('runs a macro when its run button is pressed', async () => {
    const { card, sent } = await mount(async () => [CLEAN])
    await press(card, 'Run CLEAN_NOZZLE')
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
    const { card, sent } = await mount(async () => [PARK], true)
    expect(findButton(card, 'Run PARK').disabled).toBe(true)
    await press(card, 'Run PARK')
    expect(sent).toEqual([])
    expect(card.textContent).toContain('Locked while the printer is printing')
  })
})
