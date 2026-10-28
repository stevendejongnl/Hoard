import { afterEach, describe, expect, it } from 'vitest'
import { HttpError } from '../api'
import type { PrintRecord, Spool } from '../types'
import './history-page'
import type { HistoryPage } from './history-page'

const whiteSpool = { id: 1, brand: 'Sunlu', material: 'PLA Plus', color: 'White', color_hex: '#F8FAFC' }
const blackSpool = { id: 2, brand: 'eSUN', material: 'PLA', color: 'Black', color_hex: '#111827' }

function createRecord(index: number, overrides: Partial<PrintRecord> = {}): PrintRecord {
  return {
    time: `2026-05-${String(20 - index).padStart(2, '0')}T12:00:00+00:00`,
    filename: `part-${index}.gcode`,
    status: 'completed',
    duration_s: 3600 + index * 60,
    filament_g: 10 + index,
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

const fixtureRecords = [
  createRecord(0, { spool: whiteSpool, project: { id: 1, name: 'Dactyl Manuform' } }),
  createRecord(1, { spool: blackSpool, cost_total: 0.9 }),
  createRecord(2),
]

const fixtureSpools = [
  {
    ...whiteSpool,
    cost_per_gram: 0.01,
    initial_weight_g: 1000,
    current_weight_g: 800,
    notes: null,
    active: 1,
    created_at: 0,
  },
] as Spool[]

interface Calls {
  loads: { limit: number; offset: number }[]
  assigned: { jobId: string; spoolId: number }[]
  printed: string[]
  visited: string[]
  linked: { projectId: number; jobId: string }[]
}

function createCalls(): Calls {
  return { loads: [], assigned: [], printed: [], visited: [], linked: [] }
}

async function createHistoryPage(
  calls: Calls,
  records: PrintRecord[] = fixtureRecords,
  total = records.length,
  properties: Partial<HistoryPage> = {},
): Promise<HistoryPage> {
  const page = document.createElement('history-page') as HistoryPage
  page.pageSize = 2
  page.loadHistory = async (limit, offset) => {
    calls.loads.push({ limit, offset })
    return { records: records.slice(offset, offset + limit), total }
  }
  page.loadSpools = async () => fixtureSpools
  page.loadProjects = async () => [
    { id: 1, name: 'Dactyl Manuform' },
    { id: 2, name: 'Doorhandle' },
  ]
  page.assignSpoolToPrint = async (jobId, spoolId) => {
    calls.assigned.push({ jobId, spoolId })
  }
  page.linkPrintToProject = async (projectId, jobId) => {
    calls.linked.push({ projectId, jobId })
  }
  page.startPrint = (filename) => calls.printed.push(filename)
  page.navigate = (path) => calls.visited.push(path)
  page.subscribeToHistoryUpdates = () => () => undefined
  Object.assign(page, properties)
  document.body.appendChild(page)
  await settle(page)
  return page
}

async function settle(page: HistoryPage): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
}

function readRowNames(page: HistoryPage): string[] {
  return [...page.querySelectorAll('.history-row .print-file-name')].map((name) => name.textContent?.trim() ?? '')
}

function readText(page: HistoryPage, selector: string): string {
  return page.querySelector(selector)?.textContent?.trim() ?? ''
}

async function changeField(page: HistoryPage, selector: string, value: string): Promise<void> {
  const field = page.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
  field!.value = value
  field!.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  await page.updateComplete
}

async function click(page: HistoryPage, selector: string): Promise<void> {
  page.querySelector<HTMLElement>(selector)?.click()
  await settle(page)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('history list', () => {
  it('asks for the first page and shows its prints with the total', async () => {
    const calls = createCalls()
    const page = await createHistoryPage(calls, fixtureRecords, 20)
    expect(calls.loads).toEqual([{ limit: 2, offset: 0 }])
    expect(readRowNames(page)).toEqual(['part-0.gcode', 'part-1.gcode'])
    expect(readText(page, '.history-title')).toBe('Print history')
    expect(readText(page, '.history-count')).toBe('20 prints')
    expect(readText(page, '.history-footer-count')).toBe('Showing 2 of 20')
  })

  it('shows date, time, filament and total of a print', async () => {
    const page = await createHistoryPage(createCalls())
    const row = page.querySelector('.history-row')
    expect(row?.textContent).toContain('20 May 2026')
    expect(row?.textContent).toContain('1h 0m')
    expect(row?.textContent).toContain('10.0 g')
    expect(row?.textContent).toContain('€0.15')
  })

  it('shows the spool of a print, or an invitation to assign one', async () => {
    const page = await createHistoryPage(createCalls(), fixtureRecords, 3, { pageSize: 3 })
    const rows = page.querySelectorAll('.history-row')
    expect(rows[0].querySelector('.history-spool-name')?.textContent).toBe('Sunlu PLA Plus')
    expect(rows[2].querySelector('.assign-spool-button')?.textContent?.trim()).toBe('Assign spool')
  })

  it('loads the next page when asked for more', async () => {
    const calls = createCalls()
    const page = await createHistoryPage(calls, fixtureRecords, 3)
    await click(page, 'button.load-more-button')
    expect(calls.loads[1]).toEqual({ limit: 2, offset: 2 })
    expect(readRowNames(page)).toEqual(['part-0.gcode', 'part-1.gcode', 'part-2.gcode'])
    expect(page.querySelector('button.load-more-button')).toBeNull()
  })

  it('reloads when the printer reports a changed history', async () => {
    const calls = createCalls()
    let reportChange: () => void = () => undefined
    await createHistoryPage(calls, fixtureRecords, 3, {
      subscribeToHistoryUpdates: (handler) => {
        reportChange = handler
        return () => undefined
      },
    })
    reportChange()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls.loads.length).toBe(2)
  })
})

describe('history filters', () => {
  async function createPageWithAllPrints(): Promise<HistoryPage> {
    return createHistoryPage(createCalls(), fixtureRecords, 3, { pageSize: 3 })
  }

  it('narrows the list by file name and counts what is showing', async () => {
    const page = await createPageWithAllPrints()
    await changeField(page, 'input[aria-label="Filter by file name"]', 'part-1')
    expect(readRowNames(page)).toEqual(['part-1.gcode'])
    expect(readText(page, '[data-summary="showing"]')).toBe('1')
    expect(readText(page, '[data-summary="prints"]')).toBe('3')
  })

  it('narrows the list by spool', async () => {
    const page = await createPageWithAllPrints()
    await changeField(page, 'select[aria-label="Spool"]', '2')
    expect(readRowNames(page)).toEqual(['part-1.gcode'])
  })

  it('narrows the list by project', async () => {
    const page = await createPageWithAllPrints()
    await changeField(page, 'select[aria-label="Project"]', '1')
    expect(readRowNames(page)).toEqual(['part-0.gcode'])
  })

  it('orders the list by cost', async () => {
    const page = await createPageWithAllPrints()
    await changeField(page, 'select[aria-label="Sort"]', 'highest-cost')
    expect(readRowNames(page)[0]).toBe('part-1.gcode')
  })

  it('shows every print again after resetting the filters', async () => {
    const page = await createPageWithAllPrints()
    await changeField(page, 'input[aria-label="Filter by file name"]', 'part-1')
    await click(page, 'button.reset-filters-button')
    expect(readRowNames(page).length).toBe(3)
  })

  it('says so when nothing matches', async () => {
    const page = await createPageWithAllPrints()
    await changeField(page, 'input[aria-label="Filter by file name"]', 'nothing like this')
    expect(readText(page, '.state-message')).toBe('No prints match the filters')
  })
})

describe('selected print', () => {
  it('starts with the first print selected', async () => {
    const page = await createHistoryPage(createCalls())
    expect(page.querySelector('.history-row')?.classList.contains('selected')).toBe(true)
    expect(readText(page, '.selected-print .selected-print-name')).toBe('part-0.gcode')
  })

  it('shows job and cost details of the selected print', async () => {
    const page = await createHistoryPage(createCalls())
    expect(readText(page, '[data-detail="duration"]')).toBe('1h 0m')
    expect(readText(page, '[data-detail="filament"]')).toContain('10.0')
    expect(readText(page, '[data-detail="spool"]')).toBe('Sunlu PLA Plus')
    expect(readText(page, '[data-detail="project"]')).toBe('Dactyl Manuform')
    expect(readText(page, '[data-detail="filament-cost"]')).toBe('€0.10')
    expect(readText(page, '[data-detail="electricity-cost"]')).toBe('€0.05')
    expect(readText(page, '[data-detail="average-power"]')).toContain('100')
    expect(readText(page, '[data-detail="price"]')).toContain('0.160')
    expect(readText(page, '[data-detail="total"]')).toBe('€0.15')
  })

  it('selects the print that is clicked', async () => {
    const page = await createHistoryPage(createCalls())
    await click(page, '.history-row:nth-child(2)')
    expect(readText(page, '.selected-print .selected-print-name')).toBe('part-1.gcode')
    expect(page.querySelectorAll('.history-row.selected').length).toBe(1)
  })

  it('starts the selected print again', async () => {
    const calls = createCalls()
    const page = await createHistoryPage(calls)
    await click(page, 'button.print-again-button')
    expect(calls.printed).toEqual(['part-0.gcode'])
  })

  it('opens the details page of the selected print', async () => {
    const calls = createCalls()
    const page = await createHistoryPage(calls)
    await click(page, 'button.open-details-button')
    expect(calls.visited).toEqual(['/prints/job-0'])
  })

  it('assigns a spool to a print', async () => {
    const calls = createCalls()
    const page = await createHistoryPage(calls, fixtureRecords, 3, { pageSize: 3 })
    page.querySelectorAll<HTMLElement>('.assign-spool-button')[0].click()
    await settle(page)
    await changeField(page, 'select.assign-spool-select', '1')
    await settle(page)
    expect(calls.assigned).toEqual([{ jobId: 'job-2', spoolId: 1 }])
  })

  it('links the selected print to a project', async () => {
    const calls = createCalls()
    const page = await createHistoryPage(calls)
    await click(page, 'button.add-to-project-button')
    await changeField(page, 'select.add-to-project-select', '2')
    await settle(page)
    expect(calls.linked).toEqual([{ projectId: 2, jobId: 'job-0' }])
  })

  it('shows a message when the history cannot be loaded', async () => {
    const page = await createHistoryPage(createCalls(), fixtureRecords, 3, {
      loadHistory: async () => {
        throw new Error('offline')
      },
    })
    expect(readText(page, '.state-message')).toBe('Could not load the print history')
  })

  it('says that the printer cannot be reached when the server answers 502, and not that there are no prints', async () => {
    const page = await createHistoryPage(createCalls(), fixtureRecords, 3, {
      loadHistory: async () => {
        throw new HttpError(502, 'Bad Gateway')
      },
    })
    expect(readText(page, '.state-message')).toBe('The printer cannot be reached')
  })

  it('says so when there are no prints yet', async () => {
    const page = await createHistoryPage(createCalls(), [], 0)
    expect(readText(page, '.state-message')).toBe('No prints yet')
  })
})
