import { describe, expect, it } from 'vitest'
import { buildDocumentTitle } from './document-title'
import type { PrinterState } from './types'

const NOW = new Date('2026-10-27T14:56:00Z')

function formatClockTime(date: Date): string {
  return date.toISOString().slice(11, 16)
}

function createPrinterState(overrides: Partial<PrinterState>): PrinterState {
  return {
    state: 'printing',
    filename: 'part.gcode',
    progress: 42,
    layer: null,
    layer_total: null,
    time_remaining: 3600,
    filament_used: 0,
    speed: 30,
    z_position: 1,
    ...overrides,
  }
}

describe('buildDocumentTitle', () => {
  it('is the app name while the printer is idle', () => {
    expect(buildDocumentTitle(createPrinterState({ state: 'standby' }), NOW, formatClockTime)).toBe('Hoard')
  })

  it('is the app name before any state has arrived', () => {
    expect(buildDocumentTitle(null, NOW, formatClockTime)).toBe('Hoard')
  })

  it('shows progress and the finish time while printing', () => {
    // 3600 s elapsed at 42% means 8571 s in total, so 4971 s are left: 14:56 plus 1h22m51s
    expect(buildDocumentTitle(createPrinterState({}), NOW, formatClockTime)).toBe('🖨 42% → 16:18')
  })

  it('marks a paused print', () => {
    expect(buildDocumentTitle(createPrinterState({ state: 'paused' }), NOW, formatClockTime)).toBe('⏸ 42% → 16:18')
  })

  it('shows only the icon before the print has progress', () => {
    expect(buildDocumentTitle(createPrinterState({ progress: 0 }), NOW, formatClockTime)).toBe('🖨')
  })

  it('leaves out the finish time when nothing has been printed yet', () => {
    expect(buildDocumentTitle(createPrinterState({ time_remaining: 0 }), NOW, formatClockTime)).toBe('🖨 42%')
  })
})
