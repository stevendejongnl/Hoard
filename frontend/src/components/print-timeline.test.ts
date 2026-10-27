import { afterEach, describe, expect, it } from 'vitest'
import './print-timeline'
import type { PrintTimeline } from './print-timeline'

async function createTimeline(properties: Partial<PrintTimeline>): Promise<PrintTimeline> {
  const timeline = document.createElement('print-timeline') as PrintTimeline
  Object.assign(timeline, properties)
  document.body.appendChild(timeline)
  await timeline.updateComplete
  return timeline
}

function readText(timeline: PrintTimeline, selector: string): string {
  return timeline.querySelector(selector)?.textContent?.trim() ?? ''
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('print timeline', () => {
  it('shows the time spent, the estimated total and the progress', async () => {
    const timeline = await createTimeline({ spentSeconds: 415, totalSeconds: 12840, progress: 1.8 })
    expect(readText(timeline, '.timeline-spent')).toBe('0:06:55')
    expect(readText(timeline, '.timeline-total')).toBe('3:34:00')
    expect(readText(timeline, '.timeline-progress')).toBe('1.8 %')
  })

  it('fills the bar as far as the progress and tells assistive technology', async () => {
    const timeline = await createTimeline({ spentSeconds: 415, totalSeconds: 12840, progress: 1.8 })
    const bar = timeline.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('2')
    expect(bar?.getAttribute('aria-label')).toBe('Print progress')
    expect(timeline.querySelector<HTMLElement>('.timeline-fill')?.style.width).toBe('1.8%')
  })

  it('shows dashes when nothing is printing', async () => {
    const timeline = await createTimeline({ spentSeconds: null, totalSeconds: null, progress: null })
    expect(readText(timeline, '.timeline-spent')).toBe('—')
    expect(readText(timeline, '.timeline-total')).toBe('—')
    expect(readText(timeline, '.timeline-progress')).toBe('— %')
    expect(timeline.querySelector<HTMLElement>('.timeline-fill')?.style.width).toBe('0%')
  })
})
