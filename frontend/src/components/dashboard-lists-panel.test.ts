import { afterEach, describe, expect, it } from 'vitest'
import type { PrintRecord, PrinterState, Spool } from '../types'
import './dashboard-lists-panel'
import type { DashboardListsPanel } from './dashboard-lists-panel'

function createRecord(index: number, overrides: Partial<PrintRecord> = {}): PrintRecord {
  return {
    time: `2026-05-${String(20 - index).padStart(2, '0')}T12:00:00+00:00`,
    filename: `part-${index}.gcode`,
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
    job_id: `job-${index}`,
    project: null,
    ...overrides,
  }
}

const printingState = { state: 'printing', filename: 'current.gcode' } as PrinterState
const spools = [
  {
    id: 1,
    brand: 'Sunlu',
    material: 'PLA Plus',
    color: 'White',
    color_hex: '#F8FAFC',
    current_weight_g: 840,
    active: 1,
  },
  { id: 2, brand: 'eSUN', material: 'PLA', color: 'Black', color_hex: '#111827', current_weight_g: 612, active: 0 },
] as Spool[]

interface Calls {
  loads: { limit: number; offset: number }[]
  printed: string[]
  visited: string[]
}

async function createPanel(properties: Partial<DashboardListsPanel> = {}, calls?: Calls): Promise<DashboardListsPanel> {
  const panel = document.createElement('dashboard-lists-panel') as DashboardListsPanel
  panel.loadHistory = async (limit, offset) => {
    calls?.loads.push({ limit, offset })
    return { records: [createRecord(0), createRecord(1)], total: 2 }
  }
  panel.loadSpools = async () => spools
  panel.startPrint = (filename) => void calls?.printed.push(filename)
  panel.navigate = (path) => void calls?.visited.push(path)
  panel.printerState = printingState
  panel.currentPrintWeightGrams = 36.5
  Object.assign(panel, properties)
  document.body.appendChild(panel)
  await new Promise((resolve) => setTimeout(resolve, 0))
  await panel.updateComplete
  return panel
}

function createCalls(): Calls {
  return { loads: [], printed: [], visited: [] }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('recent prints tab', () => {
  it('asks for the four latest prints', async () => {
    const calls = createCalls()
    await createPanel({}, calls)
    expect(calls.loads).toEqual([{ limit: 4, offset: 0 }])
  })

  it('starts with the print that is running now, selected', async () => {
    const panel = await createPanel()
    const first = panel.querySelector('.list-item')
    expect(first?.classList.contains('selected')).toBe(true)
    expect(first?.textContent).toContain('current.gcode')
    expect(first?.textContent).toContain('Printing now · 36.5 g')
  })

  it('lists the earlier prints with date, duration and cost', async () => {
    const panel = await createPanel()
    const items = panel.querySelectorAll('.list-item')
    expect(items.length).toBe(3)
    expect(items[1].textContent).toContain('part-0.gcode')
    expect(items[1].textContent).toContain('20 May · 1h 0m · €0.15')
  })

  it('leaves out the running print when nothing is printing', async () => {
    const panel = await createPanel({ printerState: { ...printingState, state: 'standby' } })
    expect(panel.querySelectorAll('.list-item').length).toBe(2)
    expect(panel.querySelector('.list-item.selected')).toBeNull()
  })

  it('prints an earlier print again', async () => {
    const calls = createCalls()
    const panel = await createPanel({}, calls)
    panel.querySelectorAll<HTMLElement>('button[aria-label="Print again"]')[1].click()
    expect(calls.printed).toEqual(['part-1.gcode'])
    expect(calls.visited).toEqual([])
  })

  it('opens the details of a print when its row is pressed', async () => {
    const calls = createCalls()
    const panel = await createPanel({}, calls)
    panel.querySelectorAll<HTMLElement>('.list-item')[1].click()
    expect(calls.visited).toEqual(['/prints/job-0'])
  })

  it('says so when the history cannot be loaded', async () => {
    const panel = await createPanel({
      loadHistory: async () => {
        throw new Error('offline')
      },
      printerState: null,
    })
    expect(panel.querySelector('.list-message')?.textContent).toBe('No prints to show')
  })
})

describe('spools tab', () => {
  async function openSpools(): Promise<DashboardListsPanel> {
    const panel = await createPanel()
    panel.querySelectorAll<HTMLElement>('[role="tab"]')[1].click()
    await panel.updateComplete
    return panel
  }

  it('marks the selected tab', async () => {
    const panel = await openSpools()
    const tabs = panel.querySelectorAll('[role="tab"]')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  })

  it('lists the spools with the filament that is left', async () => {
    const panel = await openSpools()
    const items = panel.querySelectorAll('.list-item')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toContain('Sunlu PLA Plus')
    expect(items[0].textContent).toContain('840 g left')
    expect(items[0].textContent).toContain('IN USE')
    expect(items[1].textContent).not.toContain('IN USE')
  })
})
