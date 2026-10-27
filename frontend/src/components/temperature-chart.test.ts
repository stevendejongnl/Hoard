import { afterEach, describe, expect, it } from 'vitest'
import type { TemperatureSample } from '../temperature-chart-geometry'
import './temperature-chart'
import type { TemperatureChart } from './temperature-chart'

const samples: TemperatureSample[] = [
  { age_seconds: 600, hotend_actual: 24, hotend_target: 0, bed_actual: 24, bed_target: 0 },
  { age_seconds: 300, hotend_actual: 150, hotend_target: 205, bed_actual: 40, bed_target: 60 },
  { age_seconds: 0, hotend_actual: 205, hotend_target: 205, bed_actual: 60, bed_target: 60 },
]

async function createChart(
  properties: Partial<TemperatureChart> = {},
  loaded: TemperatureSample[] = samples,
): Promise<TemperatureChart> {
  const chart = document.createElement('temperature-chart') as TemperatureChart
  chart.loadHistory = async () => loaded
  chart.repeatEvery = () => () => undefined
  Object.assign(chart, properties)
  document.body.appendChild(chart)
  await new Promise((resolve) => setTimeout(resolve, 0))
  await chart.updateComplete
  return chart
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('temperature chart', () => {
  it('draws a labelled image of the last ten minutes', async () => {
    const chart = await createChart()
    const image = chart.querySelector('svg')
    expect(image?.getAttribute('role')).toBe('img')
    expect(image?.getAttribute('aria-label')).toBe(
      'Temperature history, last 10 minutes: hotend heated to 205 degrees, bed to 60 degrees',
    )
  })

  it('draws six gridlines with their labels', async () => {
    const chart = await createChart()
    expect(chart.querySelectorAll('line.chart-gridline').length).toBe(6)
    expect(chart.querySelectorAll('text.chart-temperature-label').length).toBe(6)
    expect(chart.querySelectorAll('text.chart-time-label').length).toBe(6)
  })

  it('draws the hotend and the bed with their targets', async () => {
    const chart = await createChart()
    expect(chart.querySelector('polyline.hotend-line')?.getAttribute('points')).toContain('700.0,36.8')
    expect(chart.querySelector('polyline.bed-line')?.getAttribute('points')).toContain('700.0,129.6')
    expect(chart.querySelectorAll('polyline.target-line').length).toBe(2)
  })

  it('uses a smaller drawing on a phone', async () => {
    const chart = await createChart({ variant: 'compact' })
    expect(chart.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 358 150')
    expect(chart.querySelector('polyline.hotend-line')?.getAttribute('points')).toContain('350.0,29.6')
  })

  it('says the heaters are off when there are no targets', async () => {
    const chart = await createChart({}, [samples[0]])
    expect(chart.querySelector('svg')?.getAttribute('aria-label')).toContain('heaters off')
  })

  it('loads the history again whenever the repeat fires', async () => {
    let loads = 0
    let fire: () => void = () => undefined
    await createChart({
      loadHistory: async () => {
        loads += 1
        return samples
      },
      repeatEvery: (callback) => {
        fire = callback
        return () => undefined
      },
    })
    fire()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(loads).toBe(2)
  })

  it('stops repeating when it is removed', async () => {
    let stopped = false
    const chart = await createChart({
      repeatEvery: () => () => {
        stopped = true
      },
    })
    chart.remove()
    expect(stopped).toBe(true)
  })

  it('draws an empty chart when the history cannot be loaded', async () => {
    const chart = await createChart({
      loadHistory: async () => {
        throw new Error('offline')
      },
    })
    expect(chart.querySelectorAll('line.chart-gridline').length).toBe(6)
    expect(chart.querySelector('polyline.hotend-line')).toBeNull()
  })
})
