import { describe, expect, it } from 'vitest'
import {
  calculateRemainingSeconds,
  describeTemperatureStatus,
  formatClockDuration,
  formatFilamentMeters,
  formatFinishTime,
  formatSpentDuration,
} from './print-job-metrics'

describe('formatting a spent duration', () => {
  it('writes minutes and seconds under an hour', () => {
    expect(formatSpentDuration(415)).toBe('6m 55s')
  })

  it('writes hours and minutes from an hour on', () => {
    expect(formatSpentDuration(12425)).toBe('3h 27m')
  })

  it('writes seconds alone under a minute', () => {
    expect(formatSpentDuration(42)).toBe('42s')
  })
})

describe('formatting a clock duration', () => {
  it('writes hours, minutes and seconds', () => {
    expect(formatClockDuration(415)).toBe('0:06:55')
    expect(formatClockDuration(12840)).toBe('3:34:00')
  })
})

describe('formatting filament', () => {
  it('writes millimeters as meters with two decimals', () => {
    expect(formatFilamentMeters(660)).toBe('0.66')
  })
})

describe('remaining time', () => {
  it('is the estimate of the file minus the time spent', () => {
    expect(calculateRemainingSeconds({ estimatedSeconds: 12840, spentSeconds: 415, progress: 1.8 })).toBe(12425)
  })

  it('is never below zero', () => {
    expect(calculateRemainingSeconds({ estimatedSeconds: 100, spentSeconds: 400, progress: 99 })).toBe(0)
  })

  it('is extrapolated from the progress when the file has no estimate', () => {
    expect(calculateRemainingSeconds({ estimatedSeconds: null, spentSeconds: 600, progress: 25 })).toBe(1800)
  })

  it('is unknown without an estimate or progress', () => {
    expect(calculateRemainingSeconds({ estimatedSeconds: null, spentSeconds: 0, progress: 0 })).toBeNull()
  })
})

describe('finish time', () => {
  it('is the clock time after the remaining seconds', () => {
    const now = new Date('2026-10-27T14:56:00Z').getTime()
    expect(formatFinishTime(now, 12425, 'UTC')).toBe('18:23')
  })

  it('is a dash when the remaining time is unknown', () => {
    expect(formatFinishTime(0, null, 'UTC')).toBe('—')
  })
})

describe('temperature status', () => {
  it('says both heaters are at their target', () => {
    const temperatures = { hotend_actual: 204.9, hotend_target: 205, bed_actual: 60, bed_target: 60 }
    expect(describeTemperatureStatus(temperatures)).toBe('actual / target · both at target')
  })

  it('says a heater is still heating', () => {
    const temperatures = { hotend_actual: 120, hotend_target: 205, bed_actual: 60, bed_target: 60 }
    expect(describeTemperatureStatus(temperatures)).toBe('actual / target · heating')
  })

  it('says the heaters are off without targets', () => {
    const temperatures = { hotend_actual: 24, hotend_target: 0, bed_actual: 23, bed_target: 0 }
    expect(describeTemperatureStatus(temperatures)).toBe('actual / target · heaters off')
  })
})
