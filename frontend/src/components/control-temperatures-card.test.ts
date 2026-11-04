import { afterEach, describe, expect, it } from 'vitest'
import './control-temperatures-card'
import type { ControlTemperaturesCard } from './control-temperatures-card'
import { IDLE_STATUS, findButton, listButtonLabels, mountCard, press } from './control-card-testing'

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(options = {}) {
  return mountCard<ControlTemperaturesCard>('control-temperatures-card', options)
}

function targetField(card: HTMLElement, key: string): HTMLInputElement {
  return card.querySelector(`[data-heater="${key}"]`) as HTMLInputElement
}

async function changeTarget(card: ControlTemperaturesCard, key: string, value: string): Promise<void> {
  const field = targetField(card, key)
  field.value = value
  field.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('the temperatures card', () => {
  it('shows each heater with its temperature and its target', async () => {
    const { card } = await mount()
    const rows = [...card.querySelectorAll('.control-heater-row')]
    expect(rows.map((row) => row.querySelector('.control-heater-name')?.textContent?.trim())).toEqual(['Nozzle', 'Bed'])
    expect(rows[0].querySelector('.control-heater-reading')?.textContent).toContain('205')
    expect(targetField(card, 'extruder').value).toBe('210')
    expect(targetField(card, 'heater_bed').value).toBe('60')
  })

  it('sums them up in the header', async () => {
    const { card } = await mount()
    expect(card.querySelector('.control-card-header')?.textContent).toContain('Nozzle 205 / Bed 60')
  })

  it('sets a target when the field is changed', async () => {
    const { card, sent } = await mount()
    await changeTarget(card, 'extruder', '215')
    expect(sent).toEqual([{ route: 'temperature', body: { heater: 'extruder', target: 215 } }])
  })

  it('sends nothing for a value that is not a number', async () => {
    const { card, sent } = await mount()
    await changeTarget(card, 'extruder', 'abc')
    expect(sent).toEqual([])
  })

  it('heats both with a preset', async () => {
    const { card, sent } = await mount()
    await press(card, 'PETG 240 / 80')
    expect(sent).toEqual([
      { route: 'temperature', body: { heater: 'extruder', target: 240 } },
      { route: 'temperature', body: { heater: 'heater_bed', target: 80 } },
    ])
  })

  it('has the presets PLA, PETG and ABS', async () => {
    const { card } = await mount()
    expect(listButtonLabels(card)).toEqual(['PLA 210 / 60', 'PETG 240 / 80', 'ABS 250 / 100', 'Cool down'])
  })

  it('cools both down', async () => {
    const { card, sent } = await mount()
    await press(card, 'Cool down')
    expect(sent.map((command) => command.body)).toEqual([
      { heater: 'extruder', target: 0 },
      { heater: 'heater_bed', target: 0 },
    ])
  })

  it('stays available while printing, because the targets may be changed then', async () => {
    const { card, sent } = await mount({ locked: true })
    expect(findButton(card, 'Cool down').disabled).toBe(false)
    expect(targetField(card, 'extruder').disabled).toBe(false)
    await press(card, 'Cool down')
    expect(sent).toHaveLength(2)
    expect(card.querySelector('.control-lock-note')).toBeNull()
  })

  it('says there is no reading when the status is not known', async () => {
    const { card } = await mount({ status: null })
    expect(card.textContent).toContain('No reading')
  })

  it('shows the temperature of a heater the printer has beyond these', async () => {
    const status = { ...IDLE_STATUS, heaters: [...IDLE_STATUS.heaters] }
    const { card } = await mount({ status })
    expect(card.querySelectorAll('.control-heater-row')).toHaveLength(2)
  })
})
