import { describe, expect, it } from 'vitest'
import type { PrintRecord } from './types'
import {
  filterPrints,
  formatPrintCost,
  formatPrintDate,
  formatPrintDuration,
  formatPrintFilament,
  sortPrints,
} from './print-history-list'
import type { PrintFilters } from './print-history-list'

function createRecord(overrides: Partial<PrintRecord> = {}): PrintRecord {
  return {
    time: '2026-05-21T10:00:00Z',
    filename: 'plate.gcode',
    status: 'completed',
    duration_s: 3600,
    filament_g: 10,
    avg_watts: 100,
    avg_eur_per_kwh: 0.16,
    cost_electricity: 0.05,
    cost_filament: 0.1,
    cost_total: 0.15,
    spool_id: null,
    material: null,
    spool: null,
    job_id: 'job-1',
    project: null,
    ...overrides,
  }
}

const NO_FILTERS: PrintFilters = { fileName: '', spoolId: '', projectId: '', status: '' }

describe('formatting a print', () => {
  it('writes the date as day, short month and year', () => {
    expect(formatPrintDate('2026-06-04T09:30:00Z')).toBe('4 Jun 2026')
  })

  it('writes a missing date as a dash', () => {
    expect(formatPrintDate(null)).toBe('—')
  })

  it('writes the duration as hours and minutes, keeping zero hours', () => {
    expect(formatPrintDuration(13140)).toBe('3h 39m')
    expect(formatPrintDuration(660)).toBe('0h 11m')
    expect(formatPrintDuration(10800)).toBe('3h 0m')
  })

  it('writes the filament with one decimal', () => {
    expect(formatPrintFilament(36.54)).toBe('36.5 g')
  })

  it('writes the cost in euros with two decimals, or a dash without a cost', () => {
    expect(formatPrintCost(0.426)).toBe('€0.43')
    expect(formatPrintCost(null)).toBe('—')
  })
})

describe('filtering prints', () => {
  const lego = createRecord({ filename: 'Piedistallo+lego.gcode', project: { id: 1, name: 'Lego F1 stand' } })
  const blade = createRecord({
    filename: 'helicopter-blade.gcode',
    spool: { id: 7, brand: 'eSUN', material: 'PLA', color: 'Black', color_hex: '#111827' },
    status: 'cancelled',
  })
  const prints = [lego, blade]

  it('keeps everything without filters', () => {
    expect(filterPrints(prints, NO_FILTERS)).toEqual(prints)
  })

  it('matches the file name ignoring case', () => {
    expect(filterPrints(prints, { ...NO_FILTERS, fileName: 'HELI' })).toEqual([blade])
  })

  it('keeps the prints of one spool', () => {
    expect(filterPrints(prints, { ...NO_FILTERS, spoolId: '7' })).toEqual([blade])
  })

  it('keeps the prints without a spool', () => {
    expect(filterPrints(prints, { ...NO_FILTERS, spoolId: 'none' })).toEqual([lego])
  })

  it('keeps the prints of one project', () => {
    expect(filterPrints(prints, { ...NO_FILTERS, projectId: '1' })).toEqual([lego])
  })

  it('keeps the prints without a project', () => {
    expect(filterPrints(prints, { ...NO_FILTERS, projectId: 'none' })).toEqual([blade])
  })

  it('keeps the prints with one status', () => {
    expect(filterPrints(prints, { ...NO_FILTERS, status: 'cancelled' })).toEqual([blade])
  })
})

describe('sorting prints', () => {
  const old = createRecord({ time: '2026-04-01T00:00:00Z', cost_total: 1, duration_s: 60 })
  const recent = createRecord({ time: '2026-06-01T00:00:00Z', cost_total: 0.2, duration_s: 9000 })

  it('puts the newest first', () => {
    expect(sortPrints([old, recent], 'newest')).toEqual([recent, old])
  })

  it('puts the oldest first', () => {
    expect(sortPrints([recent, old], 'oldest')).toEqual([old, recent])
  })

  it('puts the highest cost first', () => {
    expect(sortPrints([recent, old], 'highest-cost')).toEqual([old, recent])
  })

  it('puts the longest print first', () => {
    expect(sortPrints([old, recent], 'longest')).toEqual([recent, old])
  })

  it('does not change the list it was given', () => {
    const given = [old, recent]
    sortPrints(given, 'newest')
    expect(given).toEqual([old, recent])
  })
})
