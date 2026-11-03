import { afterEach, describe, expect, it } from 'vitest'
import './detection-banner'
import type { DetectionBanner } from './detection-banner'
import type { DetectionAlert, DetectionState, DetectionStatus, DetectionVerdict } from '../types'

const ALERT: DetectionAlert = {
  id: 7,
  created_at: 1793714520,
  filename: 'benchy.gcode',
  score: 0.82,
  detections: [{ label: 'failure', score: 0.82, box: [100, 200, 40, 60] }],
  has_frame: true,
  verdict: null,
  frame_url: '/api/detection/alerts/7/frame',
}

function statusIn(state: DetectionState): DetectionStatus {
  return {
    configured: true,
    frames_leave_network: false,
    state,
    score: 0.8,
    settings: {
      enabled: true,
      threshold: 0.5,
      interval_seconds: 10,
      window_size: 5,
      required_frames: 3,
      action: 'notify',
    },
    suggestion: null,
  }
}

type Handler = (payload: { type: string; data: unknown }) => void

function createUpdates() {
  let handler: Handler | null = null
  return {
    subscribe: (next: Handler) => {
      handler = next
      return () => {
        handler = null
      }
    },
    send: (payload: { type: string; data: unknown }) => handler?.(payload),
  }
}

async function settle(banner: DetectionBanner): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await banner.updateComplete
}

async function createBanner(properties: Partial<DetectionBanner> = {}, alerts: DetectionAlert[] = [ALERT]) {
  const updates = createUpdates()
  const asked: Array<DetectionVerdict | 'unlabelled' | undefined> = []
  const saved: Array<{ ids: number[]; verdict: DetectionVerdict | null }> = []
  const calls = { paused: 0 }
  const banner = document.createElement('detection-banner') as DetectionBanner
  banner.loadStatus = async () => statusIn('alert')
  banner.loadAlerts = async (verdict) => {
    asked.push(verdict)
    return alerts
  }
  banner.saveVerdicts = async (ids, verdict) => {
    saved.push({ ids, verdict })
  }
  banner.pause = async () => {
    calls.paused += 1
  }
  banner.subscribeToUpdates = updates.subscribe
  banner.printerState = 'printing'
  Object.assign(banner, properties)
  document.body.appendChild(banner)
  await settle(banner)
  return { banner, updates, asked, saved, calls }
}

function findButton(banner: DetectionBanner, label: string): HTMLButtonElement | undefined {
  return [...banner.querySelectorAll('button')].find((button) => button.textContent?.trim() === label)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('detection banner', () => {
  it('shows nothing while no print looks failed', async () => {
    const { banner } = await createBanner({ loadStatus: async () => statusIn('watching') })
    expect(banner.hidden).toBe(true)
    expect(banner.textContent?.trim()).toBe('')
  })

  it('shows nothing while the server has no detector', async () => {
    const { banner } = await createBanner({ loadStatus: async () => ({ ...statusIn('alert'), configured: false }) })
    expect(banner.hidden).toBe(true)
  })

  it('shows nothing when asking the server fails', async () => {
    const { banner } = await createBanner({
      loadStatus: async () => {
        throw new Error('offline')
      },
    })
    expect(banner.hidden).toBe(true)
  })

  it('names the print and how sure the detector is when a print looks failed', async () => {
    const { banner, asked } = await createBanner()
    expect(banner.hidden).toBe(false)
    expect(banner.textContent).toContain('benchy.gcode')
    expect(banner.textContent).toContain('looks failed')
    expect(banner.textContent).toContain('82%')
    expect(asked).toEqual(['unlabelled'])
  })

  it('shows the frame that raised the alert', async () => {
    const { banner } = await createBanner()
    expect(banner.querySelector('detection-frame')).not.toBeNull()
  })

  it('appears when the watcher announces an alert', async () => {
    const { banner, updates } = await createBanner({ loadStatus: async () => statusIn('watching') })
    updates.send({ type: 'detection', data: { state: 'alert', score: 0.9 } })
    await settle(banner)
    expect(banner.hidden).toBe(false)
  })

  it('goes away when the print is no longer failing', async () => {
    const { banner, updates } = await createBanner()
    updates.send({ type: 'detection', data: { state: 'idle', score: null } })
    await settle(banner)
    expect(banner.hidden).toBe(true)
  })

  it('saves the verdict "real" for the alert and goes away', async () => {
    const { banner, saved } = await createBanner()
    findButton(banner, 'Real')?.click()
    await settle(banner)
    expect(saved).toEqual([{ ids: [7], verdict: 'real' }])
    expect(banner.hidden).toBe(true)
  })

  it('saves the verdict "false alarm" for the alert and goes away', async () => {
    const { banner, saved } = await createBanner()
    findButton(banner, 'False alarm')?.click()
    await settle(banner)
    expect(saved).toEqual([{ ids: [7], verdict: 'false_alarm' }])
    expect(banner.hidden).toBe(true)
  })

  it('stays when saving the verdict fails, and says so', async () => {
    const { banner } = await createBanner({
      saveVerdicts: async () => {
        throw new Error('offline')
      },
    })
    findButton(banner, 'Real')?.click()
    await settle(banner)
    expect(banner.hidden).toBe(false)
    expect(banner.textContent).toContain('Could not save')
  })

  it('stays hidden when every alert already has a verdict', async () => {
    const { banner } = await createBanner({}, [])
    expect(banner.hidden).toBe(true)
  })

  it('offers to pause the print while it prints', async () => {
    const { banner, calls } = await createBanner()
    findButton(banner, 'Pause print')?.click()
    await settle(banner)
    expect(calls.paused).toBe(1)
  })

  it('does not offer to pause a print that is not printing', async () => {
    const { banner } = await createBanner({ printerState: 'paused' })
    expect(findButton(banner, 'Pause print')).toBeUndefined()
  })
})
