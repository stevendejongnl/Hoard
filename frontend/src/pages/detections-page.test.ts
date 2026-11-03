import { afterEach, describe, expect, it } from 'vitest'
import './detections-page'
import type { DetectionsPage } from './detections-page'
import type { DetectionAlert, DetectionVerdict } from '../types'

function createAlert(id: number, properties: Partial<DetectionAlert> = {}): DetectionAlert {
  return {
    id,
    created_at: 1793714520,
    filename: `part-${id}.gcode`,
    score: 0.82,
    detections: [{ label: 'failure', score: 0.82, box: [100, 200, 40, 60] }],
    has_frame: true,
    verdict: null,
    frame_url: `/api/detection/alerts/${id}/frame`,
    ...properties,
  }
}

type Filter = DetectionVerdict | 'unlabelled' | undefined

async function settle(page: DetectionsPage): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
}

async function createPage(alerts: DetectionAlert[], properties: Partial<DetectionsPage> = {}) {
  const asked: Filter[] = []
  const saved: Array<{ ids: number[]; verdict: DetectionVerdict | null }> = []
  const page = document.createElement('detections-page') as DetectionsPage
  page.loadAlerts = async (verdict) => {
    asked.push(verdict)
    return alerts
  }
  page.saveVerdicts = async (ids, verdict) => {
    saved.push({ ids, verdict })
  }
  page.timeZone = 'UTC'
  Object.assign(page, properties)
  document.body.appendChild(page)
  await settle(page)
  return { page, asked, saved }
}

function row(page: DetectionsPage, id: number): HTMLElement {
  return page.querySelector(`[data-alert="${id}"]`) as HTMLElement
}

function click(element: Element | null): void {
  ;(element as HTMLElement).click()
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('detections page', () => {
  it('says so while there are no alerts', async () => {
    const { page } = await createPage([])
    expect(page.textContent).toContain('No alerts yet')
  })

  it('says so when the alerts cannot be loaded', async () => {
    const { page } = await createPage([], {
      loadAlerts: async () => {
        throw new Error('offline')
      },
    })
    expect(page.textContent).toContain('Could not load the alerts')
  })

  it('lists one row per alert with the frame, the print, the time and the score', async () => {
    const { page } = await createPage([createAlert(7), createAlert(8, { frame_url: null, has_frame: false })])
    expect(page.querySelectorAll('[data-alert]')).toHaveLength(2)
    expect(row(page, 7).textContent).toContain('part-7.gcode')
    expect(row(page, 7).textContent).toContain('3 Nov, 14:02')
    expect(row(page, 7).textContent).toContain('82%')
    expect(row(page, 7).querySelector('detection-frame')).not.toBeNull()
    expect(row(page, 8).querySelector('detection-frame')?.textContent).toContain('No frame kept')
  })

  it('asks for all alerts at first, and for the chosen verdict when the filter changes', async () => {
    const { page, asked } = await createPage([createAlert(7)])
    const filter = page.querySelector('.verdict-filter') as HTMLSelectElement
    filter.value = 'unlabelled'
    filter.dispatchEvent(new Event('change'))
    await settle(page)
    expect(asked).toEqual([undefined, 'unlabelled'])
  })

  it('marks an alert as real and shows it', async () => {
    const { page, saved } = await createPage([createAlert(7)])
    click(row(page, 7).querySelector('.verdict-real'))
    await settle(page)
    expect(saved).toEqual([{ ids: [7], verdict: 'real' }])
    expect(row(page, 7).querySelector('.verdict-real')?.classList.contains('active')).toBe(true)
  })

  it('marks an alert as a false alarm', async () => {
    const { page, saved } = await createPage([createAlert(7)])
    click(row(page, 7).querySelector('.verdict-false-alarm'))
    await settle(page)
    expect(saved).toEqual([{ ids: [7], verdict: 'false_alarm' }])
  })

  it('takes a verdict back when the same button is pressed again', async () => {
    const { page, saved } = await createPage([createAlert(7, { verdict: 'real' })])
    click(row(page, 7).querySelector('.verdict-real'))
    await settle(page)
    expect(saved).toEqual([{ ids: [7], verdict: null }])
    expect(row(page, 7).querySelector('.verdict-real')?.classList.contains('active')).toBe(false)
  })

  it('keeps the old verdict and says so when saving fails', async () => {
    const { page } = await createPage([createAlert(7)], {
      saveVerdicts: async () => {
        throw new Error('offline')
      },
    })
    click(row(page, 7).querySelector('.verdict-real'))
    await settle(page)
    expect(page.textContent).toContain('Could not save')
    expect(row(page, 7).querySelector('.verdict-real')?.classList.contains('active')).toBe(false)
  })

  it('labels several selected alerts at once', async () => {
    const { page, saved } = await createPage([createAlert(7), createAlert(8), createAlert(9)])
    click(row(page, 7).querySelector('.row-select'))
    click(row(page, 9).querySelector('.row-select'))
    await settle(page)
    expect(page.textContent).toContain('2 selected')
    click(page.querySelector('.bulk-false-alarm'))
    await settle(page)
    expect(saved).toEqual([{ ids: [7, 9], verdict: 'false_alarm' }])
    expect(row(page, 7).querySelector('.verdict-false-alarm')?.classList.contains('active')).toBe(true)
    expect(row(page, 8).querySelector('.verdict-false-alarm')?.classList.contains('active')).toBe(false)
    expect(page.textContent).not.toContain('selected')
  })

  it('selects every alert in the list at once', async () => {
    const { page } = await createPage([createAlert(7), createAlert(8)])
    click(page.querySelector('.select-all'))
    await settle(page)
    expect(page.textContent).toContain('2 selected')
  })

  it('offers no bulk buttons while nothing is selected', async () => {
    const { page } = await createPage([createAlert(7)])
    expect(page.querySelector('.bulk-real')).toBeNull()
  })
})
