import { afterEach, describe, expect, it } from 'vitest'
import './detection-strip'
import type { DetectionStrip } from './detection-strip'
import type { DetectionStatus } from '../types'

const STATUS: DetectionStatus = {
  configured: true,
  frames_leave_network: false,
  state: 'watching',
  score: 0.123,
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

async function settle(strip: DetectionStrip): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await strip.updateComplete
}

async function createStrip(properties: Partial<DetectionStrip> = {}) {
  const updates = createUpdates()
  const strip = document.createElement('detection-strip') as DetectionStrip
  strip.loadStatus = async () => STATUS
  strip.subscribeToUpdates = updates.subscribe
  Object.assign(strip, properties)
  document.body.appendChild(strip)
  await settle(strip)
  return { strip, updates }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('detection strip', () => {
  it('shows nothing while the server has no detector', async () => {
    const { strip } = await createStrip({ loadStatus: async () => ({ ...STATUS, configured: false }) })
    expect(strip.hidden).toBe(true)
    expect(strip.textContent?.trim()).toBe('')
  })

  it('shows nothing when asking the server fails', async () => {
    const { strip } = await createStrip({
      loadStatus: async () => {
        throw new Error('offline')
      },
    })
    expect(strip.hidden).toBe(true)
  })

  it('shows the state, the latest score, the limit and the frames needed', async () => {
    const { strip } = await createStrip()
    expect(strip.hidden).toBe(false)
    expect(strip.textContent).toContain('Watching')
    expect(strip.textContent).toContain('score 12%')
    expect(strip.textContent).toContain('limit 50%')
    expect(strip.textContent).toContain('3 of 5 frames')
  })

  it('marks the state with its tone', async () => {
    const { strip } = await createStrip()
    expect(strip.querySelector('.detection-light')?.classList.contains('ok')).toBe(true)
  })

  it('follows what the watcher announces', async () => {
    const { strip, updates } = await createStrip()
    updates.send({ type: 'detection', data: { state: 'alert', score: 0.84 } })
    await strip.updateComplete
    expect(strip.textContent).toContain('Looks failed')
    expect(strip.textContent).toContain('score 84%')
    expect(strip.querySelector('.detection-light')?.classList.contains('error')).toBe(true)
  })

  it('ignores other events', async () => {
    const { strip, updates } = await createStrip()
    updates.send({ type: 'temps', data: {} })
    await strip.updateComplete
    expect(strip.textContent).toContain('Watching')
  })

  it('has no score to show when the watcher has none', async () => {
    const { strip } = await createStrip({ loadStatus: async () => ({ ...STATUS, state: 'idle', score: null }) })
    expect(strip.textContent).not.toContain('score')
  })

  it('links to the page with the alerts', async () => {
    const paths: string[] = []
    const { strip } = await createStrip({ navigate: (path) => paths.push(path) })
    const link = strip.querySelector('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/detections')
    link.click()
    expect(paths).toEqual(['/detections'])
  })

  it('stops listening when it is removed', async () => {
    const { strip, updates } = await createStrip()
    strip.remove()
    expect(() => updates.send({ type: 'detection', data: { state: 'alert', score: 1 } })).not.toThrow()
  })
})
