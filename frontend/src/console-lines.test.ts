import { describe, expect, it } from 'vitest'
import {
  describeConsoleLine,
  filterConsoleLines,
  formatConsoleLine,
  formatConsoleTime,
  isTemperatureReport,
} from './console-lines'
import type { ConsoleLine } from './types'

const OPEN: { query: string; hideTemperatures: boolean; clearedUntil: number } = {
  query: '',
  hideTemperatures: false,
  clearedUntil: 0,
}

function answer(message: string, time = 10): ConsoleLine {
  return { message, time, type: 'response' }
}

describe('temperature reports', () => {
  it.each(['B:53.5 /60.0 T0:20.6 /0.0', 'ok B:53.5 /60.0 T0:20.6 /0.0', 'T0:205.3 /210.0', 'B:59.0 /0.0'])(
    'recognises %s',
    (message) => expect(isTemperatureReport(message)).toBe(true),
  )

  it.each(['// probe at 53.000,32.000 is z=1.346500', 'M115', 'FIRMWARE_NAME:Klipper', '!! Lost communication', ''])(
    'does not take %s for one',
    (message) => expect(isTemperatureReport(message)).toBe(false),
  )
})

describe('what a line is', () => {
  it('tells commands, errors, notes and answers apart', () => {
    expect(describeConsoleLine({ message: 'M115', time: 1, type: 'command' })).toBe('command')
    expect(describeConsoleLine(answer('!! Lost communication with MCU'))).toBe('error')
    expect(describeConsoleLine(answer('// Klipper state: Ready'))).toBe('note')
    expect(describeConsoleLine(answer('ok'))).toBe('response')
  })
})

describe('filtering the lines', () => {
  const lines = [answer('B:53.5 /60.0 T0:20.6 /0.0', 1), answer('// probe at 53,32 is z=1.34', 2), answer('Ready', 3)]

  it('keeps everything when nothing is asked', () => {
    expect(filterConsoleLines(lines, OPEN)).toEqual(lines)
  })

  it('hides the temperature reports on request', () => {
    expect(filterConsoleLines(lines, { ...OPEN, hideTemperatures: true }).map((line) => line.time)).toEqual([2, 3])
  })

  it('searches without caring about case', () => {
    expect(filterConsoleLines(lines, { ...OPEN, query: ' PROBE ' })).toEqual([lines[1]])
  })

  it('leaves out what was cleared, and keeps what came after', () => {
    expect(filterConsoleLines(lines, { ...OPEN, clearedUntil: 2 })).toEqual([lines[2]])
  })

  it('combines the three', () => {
    const everything = { query: 'z=', hideTemperatures: true, clearedUntil: 1 }
    expect(filterConsoleLines(lines, everything)).toEqual([lines[1]])
  })
})

describe('writing a line', () => {
  it('gives the time as hours, minutes and seconds', () => {
    expect(formatConsoleTime(1_700_000_000)).toMatch(/^\d\d:\d\d:\d\d$/)
  })

  it('puts a $ before a command and nothing before an answer', () => {
    const time = formatConsoleTime(5)
    expect(formatConsoleLine({ message: 'M115', time: 5, type: 'command' })).toBe(`${time} $ M115`)
    expect(formatConsoleLine(answer('ok', 5))).toBe(`${time} ok`)
  })
})
