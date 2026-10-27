import { afterEach, describe, expect, it } from 'vitest'
import type { PrintJob } from '../types'
import './print-detail-page'
import type { PrintDetailPage } from './print-detail-page'

const job = {
  job_id: 'job-1',
  notes: 'First layer needed a higher bed temperature.',
  settings: null,
  photos: [],
  created_at: 1,
  filename: 'helicopter-blade.gcode',
  time: '2026-05-26T12:00:00+00:00',
  duration_s: 660,
  filament_g: 3.8,
  cost_total: 0.04,
  cost_electricity: 0.01,
  cost_filament: 0.03,
  avg_watts: 105,
  avg_eur_per_kwh: 0.16,
  spool: { id: 2, brand: 'eSUN', material: 'PLA', color: 'Black', color_hex: '#111827' },
  gcode_meta: { layer_height: 0.2, nozzle_diameter: 0.4, filament_type: 'PLA', nozzle_temp: 205, bed_temp: 60 },
  project: { id: 3, name: 'Doorhandle' },
} as PrintJob

interface Calls {
  loaded: string[]
  notes: { jobId: string; notes: string }[]
  restored: string[]
  printed: string[]
  visited: string[]
}

async function createPage(properties: Partial<PrintDetailPage> = {}): Promise<{ page: PrintDetailPage; calls: Calls }> {
  const calls: Calls = { loaded: [], notes: [], restored: [], printed: [], visited: [] }
  const page = document.createElement('print-detail-page') as PrintDetailPage
  page.readJobId = () => 'job-1'
  page.loadJob = async (jobId) => {
    calls.loaded.push(jobId)
    return job
  }
  page.saveNotes = async (jobId, notes) => void calls.notes.push({ jobId, notes })
  page.restoreCost = async (jobId) => {
    calls.restored.push(jobId)
    return { cost_total: 0.05 }
  }
  page.startPrint = (filename) => void calls.printed.push(filename)
  page.navigate = (path) => void calls.visited.push(path)
  Object.assign(page, properties)
  document.body.appendChild(page)
  await settle(page)
  return { page, calls }
}

async function settle(page: PrintDetailPage): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
}

function readText(page: PrintDetailPage, selector: string): string {
  return page.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('print detail', () => {
  it('loads the print of the route', async () => {
    const { calls } = await createPage()
    expect(calls.loaded).toEqual(['job-1'])
  })

  it('names the file and the date at the top', async () => {
    const { page } = await createPage()
    expect(readText(page, '.detail-file')).toBe('helicopter-blade.gcode')
    expect(readText(page, '.detail-date')).toBe('26 May 2026')
  })

  it('shows the facts of the print on the left', async () => {
    const { page } = await createPage()
    expect(readText(page, '[data-field="duration"]')).toBe('0h 11m')
    expect(readText(page, '[data-field="filament"]')).toBe('3.8g')
    expect(readText(page, '[data-field="spool"]')).toBe('eSUN PLA')
    expect(readText(page, '[data-field="project"]')).toBe('Doorhandle')
  })

  it('shows what the slicer used', async () => {
    const { page } = await createPage()
    expect(readText(page, '[data-field="layer-height"]')).toBe('0.2mm')
    expect(readText(page, '[data-field="nozzle"]')).toBe('0.4mm')
    expect(readText(page, '[data-field="filament-type"]')).toBe('PLA')
    expect(readText(page, '[data-field="nozzle-temperature"]')).toBe('205°C')
    expect(readText(page, '[data-field="bed-temperature"]')).toBe('60°C')
  })

  it('opens the project of the print', async () => {
    const { page, calls } = await createPage()
    page.querySelector<HTMLElement>('[data-field="project"] a')?.click()
    expect(calls.visited).toEqual(['/projects/3'])
  })

  it('shows the cost on the right', async () => {
    const { page } = await createPage()
    expect(readText(page, '[data-field="filament-cost"]')).toBe('€0.03')
    expect(readText(page, '[data-field="electricity-cost"]')).toBe('€0.01')
    expect(readText(page, '[data-field="average-power"]')).toBe('105W')
    expect(readText(page, '[data-field="price"]')).toBe('0.160€/kWh')
    expect(readText(page, '[data-field="total"]')).toBe('€0.04')
  })

  it('restores the calculated cost', async () => {
    const { page, calls } = await createPage()
    page.querySelector<HTMLElement>('button.restore-cost-button')?.click()
    await settle(page)
    expect(calls.restored).toEqual(['job-1'])
    expect(readText(page, '[data-field="total"]')).toBe('€0.05')
  })

  it('prints the file again', async () => {
    const { page, calls } = await createPage()
    page.querySelector<HTMLElement>('button.print-again-button')?.click()
    expect(calls.printed).toEqual(['helicopter-blade.gcode'])
  })

  it('goes back to the history', async () => {
    const { page, calls } = await createPage()
    page.querySelector<HTMLElement>('button.back-button')?.click()
    expect(calls.visited).toEqual(['/history'])
  })

  it('has the photos and the notes of the print in the middle', async () => {
    const { page } = await createPage()
    expect(page.querySelector('print-photos')).not.toBeNull()
    expect(page.querySelector('markdown-editor')?.getAttribute('value')).toBe(job.notes)
  })

  it('saves the notes for this print', async () => {
    const { page, calls } = await createPage()
    const editor = page.querySelector<HTMLElement & { saveNotes: (notes: string) => Promise<unknown> }>(
      'markdown-editor',
    )!
    await editor.saveNotes('New notes')
    expect(calls.notes).toEqual([{ jobId: 'job-1', notes: 'New notes' }])
  })

  it('says so when the print cannot be loaded', async () => {
    const { page } = await createPage({
      loadJob: async () => {
        throw new Error('missing')
      },
    })
    expect(readText(page, '.state-message')).toBe('Could not load this print')
  })
})
