import { afterEach, describe, expect, it } from 'vitest'
import './control-z-offset'
import type { ControlZOffset } from './control-z-offset'
import { findButton, mountCard, press } from './control-card-testing'

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(options: { locked?: boolean; showSave?: boolean } = {}) {
  const { card, sent } = await mountCard<ControlZOffset>('control-z-offset', options)
  const opened: string[] = []
  card.showSave = options.showSave ?? true
  card.openSaveDialog = () => opened.push('save dialog')
  await card.updateComplete
  return { card, sent, opened }
}

describe('the Z offset with a save button', () => {
  it('has no save button unless it is asked for', async () => {
    const { card } = await mount({ showSave: false })
    expect(() => findButton(card, 'Save Z offset to config')).toThrow()
  })

  it('applies the babystep to the probe offset and then opens the save dialog', async () => {
    const { card, sent, opened } = await mount()
    await press(card, 'Save Z offset to config')
    expect(sent).toEqual([{ route: 'calibrate/apply_probe_offset', body: {} }])
    expect(opened).toEqual(['save dialog'])
  })

  it('does not open the save dialog when the printer refused to apply the babystep', async () => {
    const { card, opened } = await mount()
    card.send = async () => {
      throw new Error('refused')
    }
    await press(card, 'Save Z offset to config')
    expect(opened).toEqual([])
  })

  it('is locked while printing, because saving restarts Klipper', async () => {
    const { card } = await mount({ locked: true })
    expect(findButton(card, 'Save Z offset to config').disabled).toBe(true)
  })
})
