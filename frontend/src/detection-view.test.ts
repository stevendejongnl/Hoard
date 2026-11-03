import { describe, expect, it } from 'vitest'
import {
  describeAlertTime,
  describeDetectionState,
  describeFrameRule,
  findStateTone,
  formatPercent,
  toTopLeftBox,
} from './detection-view'
import type { DetectionSettings, DetectionState } from './types'

const SETTINGS: DetectionSettings = {
  enabled: true,
  threshold: 0.5,
  interval_seconds: 10,
  window_size: 5,
  required_frames: 3,
  action: 'notify',
}

describe('describeDetectionState', () => {
  it.each<[DetectionState, string]>([
    ['off', 'Off'],
    ['idle', 'Idle'],
    ['watching', 'Watching'],
    ['unavailable', 'Detector unavailable'],
    ['alert', 'Looks failed'],
  ])('names %s as %s', (state, text) => {
    expect(describeDetectionState(state)).toBe(text)
  })
})

describe('findStateTone', () => {
  it.each<[DetectionState, string]>([
    ['off', 'muted'],
    ['idle', 'muted'],
    ['watching', 'ok'],
    ['unavailable', 'warning'],
    ['alert', 'error'],
  ])('shows %s with the tone %s', (state, tone) => {
    expect(findStateTone(state)).toBe(tone)
  })
})

describe('formatPercent', () => {
  it('rounds a score to a whole percent', () => {
    expect(formatPercent(0.123)).toBe('12%')
    expect(formatPercent(0.825)).toBe('83%')
  })

  it('shows a dash when there is no score', () => {
    expect(formatPercent(null)).toBe('–')
  })
})

describe('describeFrameRule', () => {
  it('says how many of the newest frames must look failed', () => {
    expect(describeFrameRule(SETTINGS)).toBe('3 of 5 frames')
  })
})

describe('describeAlertTime', () => {
  it('shows day, month and time in the given zone', () => {
    // 2026-11-03 14:02:00 UTC
    expect(describeAlertTime(1793714520, 'UTC')).toBe('3 Nov, 14:02')
  })
})

describe('toTopLeftBox', () => {
  it('turns the centre, width and height of the detector into a corner, width and height', () => {
    expect(toTopLeftBox([100, 200, 40, 60])).toEqual({ x: 80, y: 170, width: 40, height: 60 })
  })
})
