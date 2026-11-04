import { afterEach, describe, expect, it } from 'vitest'
import './control-tuning-card'
import type { ControlTuningCard } from './control-tuning-card'
import { findButton, mountCard, press } from './control-card-testing'

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(options = {}) {
  return mountCard<ControlTuningCard>('control-tuning-card', options)
}

function slider(card: HTMLElement, name: string): HTMLInputElement {
  return card.querySelector(`[data-control="${name}"]`) as HTMLInputElement
}

async function drag(card: ControlTuningCard, name: string, value: string): Promise<void> {
  const field = slider(card, name)
  field.value = value
  field.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('the speed, flow and fans card', () => {
  it('shows the speed, the flow and each fan as they are', async () => {
    const { card } = await mount()
    expect(slider(card, 'speed').value).toBe('100')
    expect(slider(card, 'flow').value).toBe('98')
    expect(slider(card, 'fan:').value).toBe('50')
    expect(slider(card, 'fan:aux').value).toBe('0')
    const labels = [...card.querySelectorAll('.control-slider-label')].map((label) => label.textContent?.trim())
    expect(labels).toEqual(['Speed', 'Flow', 'Part fan', 'Aux fan'])
  })

  it('writes the value next to a slider, and off for a fan that is off', async () => {
    const { card } = await mount()
    const values = [...card.querySelectorAll('.control-slider-value')].map((value) => value.textContent?.trim())
    expect(values).toEqual(['100 %', '98 %', '50 %', 'off'])
  })

  it('shows the new value while a slider is dragged, and sends it when it is let go', async () => {
    const { card, sent } = await mount()
    const field = slider(card, 'speed')
    field.value = '130'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await card.updateComplete
    expect(card.querySelector('[data-value="speed"]')?.textContent).toContain('130 %')
    expect(sent).toEqual([])
    field.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toEqual([{ route: 'speed', body: { percent: 130 } }])
  })

  it('sets the flow', async () => {
    const { card, sent } = await mount()
    await drag(card, 'flow', '95')
    expect(sent).toEqual([{ route: 'flow', body: { percent: 95 } }])
  })

  it('sets the part fan without a name, and another fan with its name', async () => {
    const { card, sent } = await mount()
    await drag(card, 'fan:', '70')
    await drag(card, 'fan:aux', '40')
    expect(sent).toEqual([
      { route: 'fan', body: { percent: 70 } },
      { route: 'fan', body: { percent: 40, name: 'aux' } },
    ])
  })

  it('shows the Z offset, and nudges it by the step', async () => {
    const { card, sent } = await mount()
    expect(card.querySelector('.control-z-offset-value')?.textContent).toContain('-0.120 mm')
    await press(card, 'Lower 0.05')
    await press(card, 'Raise 0.05')
    expect(sent).toEqual([
      { route: 'babystep', body: { offset: -0.05 } },
      { route: 'babystep', body: { offset: 0.05 } },
    ])
  })

  it('nudges by another step when it is chosen', async () => {
    const { card, sent } = await mount()
    await press(card, '0.01')
    expect(findButton(card, '0.01').getAttribute('aria-pressed')).toBe('true')
    await press(card, 'Raise 0.01')
    expect(sent).toEqual([{ route: 'babystep', body: { offset: 0.01 } }])
  })

  it('stays available while printing, and has no lock note', async () => {
    const { card, sent } = await mount({ locked: true })
    expect(slider(card, 'speed').disabled).toBe(false)
    expect(findButton(card, 'Raise 0.05').disabled).toBe(false)
    await press(card, 'Raise 0.05')
    expect(sent).toHaveLength(1)
    expect(card.querySelector('.control-lock-note')).toBeNull()
  })

  it('says there is no reading when the status is not known', async () => {
    const { card } = await mount({ status: null })
    expect(card.textContent).toContain('No reading')
  })
})
