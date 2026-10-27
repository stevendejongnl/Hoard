import { afterEach, describe, expect, it } from 'vitest'
import type { GcodeFile, PredictResult, PrintRecord, Spool } from '../types'
import './cost-predictor-panel'
import type { CostPredictorPanel } from './cost-predictor-panel'

const files = [{ filename: 'helicopter-blade.gcode' }, { filename: 'other part.gcode' }] as GcodeFile[]
const spools = [
  { id: 1, brand: 'Sunlu', material: 'PLA Plus', active: 1 },
  { id: 2, brand: 'eSUN', material: 'PLA', active: 0 },
] as Spool[]
const history = [
  { filename: 'helicopter-blade.gcode', spool: { id: 2 } },
  { filename: 'other part.gcode', spool: null },
] as PrintRecord[]

function createPrediction(overrides: Partial<PredictResult> = {}): PredictResult {
  return { filament_g: 3.8, estimated_time_s: 660, cost_total: 0.04, ...overrides } as PredictResult
}

async function createPanel(
  predictions: { filename: string; spoolId: number | null }[],
  properties: Partial<CostPredictorPanel> = {},
): Promise<CostPredictorPanel> {
  const panel = document.createElement('cost-predictor-panel') as CostPredictorPanel
  panel.loadFiles = async () => files
  panel.loadSpools = async () => spools
  panel.loadRecentPrints = async () => history
  panel.loadPrediction = async (filename, spoolId) => {
    predictions.push({ filename, spoolId })
    return createPrediction()
  }
  Object.assign(panel, properties)
  document.body.appendChild(panel)
  await settle(panel)
  return panel
}

async function settle(panel: CostPredictorPanel): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await panel.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await panel.updateComplete
}

function readText(panel: CostPredictorPanel, selector: string): string {
  return panel.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

async function choose(panel: CostPredictorPanel, selector: string, value: string): Promise<void> {
  const select = panel.querySelector<HTMLSelectElement>(selector)
  select!.value = value
  select!.dispatchEvent(new Event('change', { bubbles: true }))
  await settle(panel)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('cost predictor', () => {
  it('starts with the first file, without its extension', async () => {
    const panel = await createPanel([])
    expect(readText(panel, '[data-field="file"]')).toBe('helicopter-blade')
  })

  it('starts with the spool that printed the file last', async () => {
    const predictions: { filename: string; spoolId: number | null }[] = []
    const panel = await createPanel(predictions)
    expect(readText(panel, '[data-field="spool"]')).toBe('eSUN PLA')
    expect(predictions).toEqual([{ filename: 'helicopter-blade.gcode', spoolId: 2 }])
  })

  it('falls back to the spool in use when the file was never printed', async () => {
    const predictions: { filename: string; spoolId: number | null }[] = []
    await createPanel(predictions, { loadRecentPrints: async () => [] })
    expect(predictions).toEqual([{ filename: 'helicopter-blade.gcode', spoolId: 1 }])
  })

  it('shows the filament, the time and the total of the prediction', async () => {
    const panel = await createPanel([])
    expect(readText(panel, '[data-field="filament-time"]')).toBe('3.8 g · 0h 11m')
    expect(readText(panel, '[data-field="total"]')).toBe('€0.04')
  })

  it('predicts again for another file', async () => {
    const predictions: { filename: string; spoolId: number | null }[] = []
    const panel = await createPanel(predictions)
    await choose(panel, 'select[aria-label="File"]', 'other part.gcode')
    expect(predictions[1]).toEqual({ filename: 'other part.gcode', spoolId: 2 })
  })

  it('predicts again for another spool', async () => {
    const predictions: { filename: string; spoolId: number | null }[] = []
    const panel = await createPanel(predictions)
    await choose(panel, 'select[aria-label="Spool"]', '1')
    expect(predictions[1]).toEqual({ filename: 'helicopter-blade.gcode', spoolId: 1 })
  })

  it('shows dashes when the prediction fails', async () => {
    const panel = await createPanel([], {
      loadPrediction: async () => {
        throw new Error('offline')
      },
    })
    expect(readText(panel, '[data-field="total"]')).toBe('—')
    expect(readText(panel, '[data-field="filament-time"]')).toBe('—')
  })

  it('says so when the printer has no files', async () => {
    const panel = await createPanel([], { loadFiles: async () => [] })
    expect(readText(panel, '.predictor-message')).toBe('No files on the printer')
  })

  it('folds away and back', async () => {
    const panel = await createPanel([])
    const toggle = panel.querySelector<HTMLElement>('button.predictor-toggle')
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    toggle?.click()
    await panel.updateComplete
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(panel.querySelector('[data-field="total"]')).toBeNull()
  })
})
