import { describe, expect, it } from 'vitest'
import { parseScrewsTilt } from './screws-tilt'
import type { ConsoleLine } from './types'

function lines(...messages: string[]): ConsoleLine[] {
  return messages.map((message, index) => ({ message, time: index, type: 'response' }))
}

const BASE = '// front_left (base) : x=40.0, y=40.0, z=2.31561'
const ADJUST = '// front_right : x=210.0, y=40.0, z=2.29313 : adjust CW 00:01'
const ADJUST_COUNTER = '// rear_right : x=210.0, y=210.0, z=2.40113 : adjust CCW 00:15'

describe('reading the result of the screws tilt adjust', () => {
  it('gives the base screw and what the others need', () => {
    expect(parseScrewsTilt(lines(BASE, ADJUST, ADJUST_COUNTER))).toEqual([
      { name: 'front_left', isBase: true, direction: null, turn: null },
      { name: 'front_right', isBase: false, direction: 'CW', turn: '00:01' },
      { name: 'rear_right', isBase: false, direction: 'CCW', turn: '00:15' },
    ])
  })

  it('uses only the newest result', () => {
    const older = '// front_left (base) : x=40.0, y=40.0, z=2.0'
    const result = parseScrewsTilt(lines(older, ADJUST, 'ok', BASE, ADJUST_COUNTER))
    expect(result.map((screw) => screw.name)).toEqual(['front_left', 'rear_right'])
  })

  it('ignores lines that are about something else', () => {
    expect(parseScrewsTilt(lines('M115', '// Klipper state: Ready', BASE))).toHaveLength(1)
  })

  it('gives nothing when there was no result', () => {
    expect(parseScrewsTilt(lines('M115', 'ok'))).toEqual([])
    expect(parseScrewsTilt([])).toEqual([])
  })

  it('reads a result whose lines are not marked as comments', () => {
    expect(parseScrewsTilt(lines('front_left (base) : x=40.0, y=40.0, z=2.3'))).toHaveLength(1)
  })

  it('says a screw is level when it needs no turn', () => {
    const level = '// front_right : x=210.0, y=40.0, z=2.3 : adjust CW 00:00'
    expect(parseScrewsTilt(lines(BASE, level))[1]).toEqual({
      name: 'front_right',
      isBase: false,
      direction: 'CW',
      turn: '00:00',
    })
  })
})
