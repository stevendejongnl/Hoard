import { afterEach, describe, expect, it } from 'vitest'
import type { GcodeFile } from '../types'
import './dashboard-page'
import type { DashboardPage } from './dashboard-page'
import type { StatusBar } from '../components/status-bar'

type Handler = (payload: { type: string; data: unknown }) => void

const printerState = {
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
const temperatures = { hotend_actual: 204.9, hotend_target: 205, bed_actual: 60, bed_target: 60 }
const power = { watts: 109, eur_per_kwh: 0.16, switch: 'on' }
const piStats = { cpu_temp: 37.6, cpu_load: 3.9, memory_pct: 32.1, disk_pct: 66.2, uptime_s: 85140 }
const metadata = { filename: printerState.filename, estimated_time: 12840, filament_weight_total: 36.5 } as GcodeFile

async function createPage(properties: Partial<DashboardPage> = {}): Promise<{ page: DashboardPage; send: Handler }> {
  let send: Handler = () => undefined
  const page = document.createElement('dashboard-page') as DashboardPage
  page.subscribeToUpdates = (handler) => {
    send = handler
    return () => undefined
  }
  page.loadFileMetadata = async () => metadata
  page.isPhoneLayout = () => false
  page.now = () => new Date('2026-10-27T14:56:00Z').getTime()
  page.timeZone = 'UTC'
  Object.assign(page, properties)
  document.body.appendChild(page)
  await page.updateComplete
  return { page, send }
}

async function deliverEverything(page: DashboardPage, send: Handler): Promise<void> {
  send({ type: 'printer_state', data: printerState })
  send({ type: 'temps', data: temperatures })
  send({ type: 'power', data: power })
  send({ type: 'pi_stats', data: piStats })
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('desktop dashboard', () => {
  it('shows the parameters, the camera, the chart, the timeline and the lists', async () => {
    const { page } = await createPage()
    for (const tag of [
      'printer-parameter-panel',
      'camera-panel',
      'temperature-chart',
      'print-timeline',
      'dashboard-lists-panel',
      'cost-predictor-panel',
    ]) {
      expect(page.querySelector(tag), tag).not.toBeNull()
    }
    expect(page.querySelector('phone-print-summary')).toBeNull()
  })

  it('passes what the printer reports to the parameter panel', async () => {
    const { page, send } = await createPage()
    await deliverEverything(page, send)
    expect(page.querySelector('[data-field="progress"]')?.textContent).toBe('1.8%')
    expect(page.querySelector('[data-field="hotend-actual"]')?.textContent).toBe('204.9°C')
    expect(page.querySelector('[data-field="draw"]')?.textContent).toBe('109W')
    expect(page.querySelector('[data-field="cpu-load"]')?.textContent).toBe('3.9%')
  })

  it('takes the total and the remaining time from the file of the running print', async () => {
    const { page, send } = await createPage()
    await deliverEverything(page, send)
    expect(page.querySelector('.timeline-total')?.textContent).toBe('3:34:00')
    expect(page.querySelector('[data-field="remaining"]')?.textContent).toBe('3h 27m')
    expect(page.querySelector('[data-field="finish"]')?.textContent).toBe('18:23')
  })

  it('shows the time spent on the timeline', async () => {
    const { page, send } = await createPage()
    await deliverEverything(page, send)
    expect(page.querySelector('.timeline-spent')?.textContent).toBe('0:06:55')
  })

  it('names the temperature chart and its lines', async () => {
    const { page } = await createPage()
    expect(page.querySelector('.chart-title')?.textContent).toBe('Temperature')
    expect(page.querySelector('.chart-legend')?.textContent).toContain('dashed = target')
  })

  it('asks the file for its estimate once per file', async () => {
    const requested: string[] = []
    const { page, send } = await createPage({
      loadFileMetadata: async (filename) => {
        requested.push(filename)
        return metadata
      },
    })
    await deliverEverything(page, send)
    await deliverEverything(page, send)
    expect(requested).toEqual([printerState.filename])
  })

  it('stops listening when it is removed', async () => {
    let stopped = false
    const { page } = await createPage({
      subscribeToUpdates: () => () => {
        stopped = true
      },
    })
    page.remove()
    expect(stopped).toBe(true)
  })
})

describe('phone dashboard', () => {
  it('shows the print summary, the temperatures and the camera', async () => {
    const { page } = await createPage({ isPhoneLayout: () => true })
    for (const tag of ['phone-print-summary', 'phone-temperature-section', 'camera-panel']) {
      expect(page.querySelector(tag), tag).not.toBeNull()
    }
  })

  it('shows the parameter sections under the camera', async () => {
    const { page, send } = await createPage({ isPhoneLayout: () => true })
    await deliverEverything(page, send)
    const panel = page.querySelector('.dashboard-phone camera-panel ~ printer-parameter-panel')
    expect(panel?.querySelector('button[aria-label="Printer power"]')).not.toBeNull()
    expect(panel?.querySelector('[data-field="cpu-temperature"]')?.textContent).toContain('37.6')
  })

  it('shows the lists and the cost predictor under the parameter sections', async () => {
    const { page } = await createPage({ isPhoneLayout: () => true })
    expect(page.querySelector('printer-parameter-panel ~ dashboard-lists-panel')).not.toBeNull()
    expect(page.querySelector('dashboard-lists-panel ~ cost-predictor-panel')).not.toBeNull()
  })

  it('opens the file browser from the lists', async () => {
    const { page } = await createPage({ isPhoneLayout: () => true })
    const lists = page.querySelector('dashboard-lists-panel')!
    lists.dispatchEvent(new CustomEvent('open-file-browser', { detail: { purpose: 'print' }, bubbles: true }))
    await page.updateComplete
    expect(page.querySelector('file-browser-modal')?.hasAttribute('open')).toBe(true)
  })

  it('ends with the status bar, with the state of the printer', async () => {
    const { page, send } = await createPage({ isPhoneLayout: () => true })
    await deliverEverything(page, send)
    const statusBar = page.querySelector<StatusBar>('.dashboard-phone > status-bar:last-child')
    expect(statusBar?.printerState).toBe('printing')
  })

  it('offers pause and cancel once, in the summary', async () => {
    const { page, send } = await createPage({ isPhoneLayout: () => true })
    await deliverEverything(page, send)
    expect(page.querySelectorAll('button.pause-button')).toHaveLength(1)
    expect(page.querySelectorAll('button.cancel-button')).toHaveLength(1)
  })

  it('shows when the print will be done', async () => {
    const { page, send } = await createPage({ isPhoneLayout: () => true })
    await deliverEverything(page, send)
    expect(page.querySelector('.summary-finish')?.textContent).toBe('Done 18:23 · 3h 27m left')
  })
})
describe('file browser', () => {
  it('is closed until a part of the page asks for it', async () => {
    const { page } = await createPage()
    expect(page.querySelector('file-browser-modal')?.hasAttribute('open')).toBe(false)
  })

  it('opens when asked, and starts a print for a file chosen to print', async () => {
    const printed: string[] = []
    const { page } = await createPage({ startPrint: (filename) => void printed.push(filename) })
    page.dispatchEvent(new CustomEvent('open-file-browser', { detail: { purpose: 'print' }, bubbles: true }))
    await page.updateComplete
    const browser = page.querySelector('file-browser-modal')!
    expect(browser.hasAttribute('open')).toBe(true)
    browser.dispatchEvent(new CustomEvent('file-selected', { detail: { filename: 'blade.gcode' }, bubbles: true }))
    await page.updateComplete
    expect(printed).toEqual(['blade.gcode'])
  })

  it('hands a file chosen for the prediction to the cost predictor', async () => {
    const { page } = await createPage()
    const predictor = page.querySelector('cost-predictor-panel') as unknown as {
      chooseFile: (name: string) => Promise<void>
    }
    const chosen: string[] = []
    predictor.chooseFile = async (name) => void chosen.push(name)
    page.dispatchEvent(new CustomEvent('open-file-browser', { detail: { purpose: 'predict' }, bubbles: true }))
    await page.updateComplete
    page
      .querySelector('file-browser-modal')!
      .dispatchEvent(new CustomEvent('file-selected', { detail: { filename: 'blade.gcode' }, bubbles: true }))
    await page.updateComplete
    expect(chosen).toEqual(['blade.gcode'])
  })

  it('closes again when the browser closes', async () => {
    const { page } = await createPage()
    page.dispatchEvent(new CustomEvent('open-file-browser', { detail: { purpose: 'print' }, bubbles: true }))
    await page.updateComplete
    page.querySelector('file-browser-modal')!.dispatchEvent(new CustomEvent('close', { bubbles: true }))
    await page.updateComplete
    expect(page.querySelector('file-browser-modal')?.hasAttribute('open')).toBe(false)
  })
})
