import { describe, expect, it } from 'vitest'
import { buildTemperatureChart } from './temperature-chart-geometry'
import type { TemperatureChartLayout, TemperatureSample } from './temperature-chart-geometry'

const layout: TemperatureChartLayout = {
  left: 34,
  right: 700,
  bottom: 168,
  top: 8,
  labelBaseline: 184,
  maximumTemperature: 250,
  windowSeconds: 600,
}

function sample(
  ageSeconds: number,
  hotendActual: number,
  hotendTarget = 0,
  bedActual = 24,
  bedTarget = 0,
): TemperatureSample {
  return {
    age_seconds: ageSeconds,
    hotend_actual: hotendActual,
    hotend_target: hotendTarget,
    bed_actual: bedActual,
    bed_target: bedTarget,
  }
}

describe('temperature chart axes', () => {
  const chart = buildTemperatureChart([], layout)

  it('has a gridline and label every fifty degrees from zero to the maximum', () => {
    expect(chart.temperatureTicks.map((tick) => tick.label)).toEqual(['0', '50', '100', '150', '200', '250'])
    expect(chart.temperatureTicks[0].y).toBe(168)
    expect(chart.temperatureTicks[5].y).toBe(8)
    expect(chart.temperatureTicks[2].y).toBe(104)
  })

  it('has a label every two minutes from ten minutes ago until now', () => {
    expect(chart.timeTicks.map((tick) => tick.label)).toEqual(['-10m', '-8m', '-6m', '-4m', '-2m', 'now'])
    expect(chart.timeTicks[0]).toMatchObject({ x: 34, anchor: 'start' })
    expect(chart.timeTicks[5]).toMatchObject({ x: 700, anchor: 'end' })
    expect(chart.timeTicks[3].x).toBeCloseTo(433.6, 1)
    expect(chart.timeTicks[3].anchor).toBe('middle')
  })
})

describe('temperature chart lines', () => {
  const samples = [sample(600, 24), sample(300, 100), sample(0, 205, 205, 60, 60)]
  const chart = buildTemperatureChart(samples, layout)

  it('draws the hotend from the oldest sample on the left to the newest on the right', () => {
    expect(chart.hotendLine).toBe('34.0,152.6 367.0,104.0 700.0,36.8')
  })

  it('draws the bed with the same scale', () => {
    expect(chart.bedLine).toBe('34.0,152.6 367.0,152.6 700.0,129.6')
  })

  it('draws a target as a step where the target changes', () => {
    const stepped = buildTemperatureChart([sample(600, 24), sample(300, 24, 205), sample(0, 205, 205)], layout)
    expect(stepped.hotendTargetLine).toBe('34.0,168.0 367.0,168.0 367.0,36.8 700.0,36.8')
  })

  it('has no lines without samples', () => {
    const empty = buildTemperatureChart([], layout)
    expect(empty.hotendLine).toBe('')
    expect(empty.bedTargetLine).toBe('')
  })
})

describe('temperature chart rounding', () => {
  it('rounds the x of a point on a half pixel up, as the design does', () => {
    const chart = buildTemperatureChart([sample(575, 24), sample(0, 24)], layout)
    expect(chart.hotendLine.split(' ')[0].split(',')[0]).toBe('61.8')
  })
})
