import { afterEach, describe, expect, it } from 'vitest'
import type { Power, Temps } from '../types'
import './phone-temperature-section'
import type { PhoneTemperatureSection } from './phone-temperature-section'

const temperatures: Temps = { hotend_actual: 204.9, hotend_target: 205, bed_actual: 60, bed_target: 60 }
const power: Power = { watts: 109, eur_per_kwh: 0.16, switch: 'on' }

async function createSection(properties: Partial<PhoneTemperatureSection> = {}): Promise<PhoneTemperatureSection> {
  const section = document.createElement('phone-temperature-section') as PhoneTemperatureSection
  section.temperatures = temperatures
  section.power = power
  Object.assign(section, properties)
  document.body.appendChild(section)
  await section.updateComplete
  return section
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('phone temperature section', () => {
  it('names the section and shows the actual temperatures in the legend', async () => {
    const section = await createSection()
    expect(section.querySelector('.section-title')?.textContent).toBe('Temperature')
    const legend = [...section.querySelectorAll('.legend-value')].map((item) => item.textContent?.trim())
    expect(legend).toEqual(['204.9°', '60.0°'])
  })

  it('draws the compact chart', async () => {
    const section = await createSection()
    expect(section.querySelector('temperature-chart')?.getAttribute('variant')).toBe('compact')
  })

  it('shows the power draw and price', async () => {
    const section = await createSection()
    expect(section.querySelector('[data-field="draw"]')?.textContent?.trim()).toBe('109W')
    expect(section.querySelector('[data-field="price"]')?.textContent?.trim()).toBe('0.16€/kWh')
  })

  it('shows dashes before the printer reports anything', async () => {
    const section = await createSection({ temperatures: null, power: null })
    expect(section.querySelector('[data-field="draw"]')?.textContent?.trim()).toBe('—W')
  })
})
