import { afterEach, describe, expect, it } from 'vitest'
import type { PrinterState } from '../types'
import './phone-print-summary'
import type { PhonePrintSummary } from './phone-print-summary'

const printingState: PrinterState = {
  state: 'printing',
  filename: 'Piedistallo+per+lego+F1+2Posti.gcode',
  progress: 1.8,
  layer: null,
  layer_total: null,
  time_remaining: 415,
  filament_used: 660,
  speed: 30,
  z_position: 0.6,
}

interface Calls {
  paused: number
  resumed: number
  cancelled: number
  confirmations: string[]
}

async function createSummary(calls: Calls, properties: Partial<PhonePrintSummary> = {}): Promise<PhonePrintSummary> {
  const summary = document.createElement('phone-print-summary') as PhonePrintSummary
  summary.printerState = printingState
  summary.estimatedSeconds = 12840
  summary.now = () => new Date('2026-10-27T14:56:00Z').getTime()
  summary.timeZone = 'UTC'
  summary.pausePrint = async () => void (calls.paused += 1)
  summary.resumePrint = async () => void (calls.resumed += 1)
  summary.cancelPrint = async () => void (calls.cancelled += 1)
  summary.confirmAction = (message) => {
    calls.confirmations.push(message)
    return true
  }
  Object.assign(summary, properties)
  document.body.appendChild(summary)
  await summary.updateComplete
  return summary
}

function createCalls(): Calls {
  return { paused: 0, resumed: 0, cancelled: 0, confirmations: [] }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('phone print summary', () => {
  it('shows the file, the progress and when it will be done', async () => {
    const summary = await createSummary(createCalls())
    expect(summary.querySelector('.summary-file')?.textContent).toBe('Piedistallo+per+lego+F1+2Posti.gcode')
    expect(summary.querySelector('.summary-progress')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1.8 %')
    expect(summary.querySelector('.summary-finish')?.textContent).toBe('Done 18:23 · 3h 27m left')
  })

  it('fills the progress bar', async () => {
    const summary = await createSummary(createCalls())
    expect(summary.querySelector<HTMLElement>('.timeline-fill')?.style.width).toBe('1.8%')
  })

  it('pauses, resumes and cancels with a confirmation', async () => {
    const calls = createCalls()
    const summary = await createSummary(calls)
    summary.querySelector<HTMLElement>('button.pause-button')?.click()
    expect(summary.querySelector('button.pause-button')?.textContent?.trim()).toBe('Pause')
    summary.querySelector<HTMLElement>('button.cancel-button')?.click()
    await summary.updateComplete
    expect(calls).toMatchObject({ paused: 1, cancelled: 1, confirmations: ['Cancel this print?'] })
  })

  it('offers to resume a paused print', async () => {
    const calls = createCalls()
    const summary = await createSummary(calls, { printerState: { ...printingState, state: 'paused' } })
    expect(summary.querySelector('button.pause-button')?.textContent?.trim()).toBe('Resume')
    summary.querySelector<HTMLElement>('button.pause-button')?.click()
    expect(calls.resumed).toBe(1)
  })

  it('says the printer is idle when nothing is printing', async () => {
    const summary = await createSummary(createCalls(), { printerState: { ...printingState, state: 'standby' } })
    expect(summary.querySelector('.summary-file')?.textContent).toBe('No print running')
    expect(summary.querySelector('button.pause-button')).toBeNull()
  })
})
