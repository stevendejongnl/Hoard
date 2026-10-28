import { afterEach, describe, expect, it } from 'vitest'
import type { Webcam } from '../api'
import './camera-panel'
import type { CameraPanel } from './camera-panel'

function createWebcam(overrides: Partial<Webcam> = {}): Webcam {
  return {
    name: 'Enclosure',
    stream_url: '/api/webcams/0/stream',
    snapshot_url: '/api/webcams/0/snapshot',
    aspect_ratio: '4:3',
    target_fps: 15,
    ...overrides,
  } as Webcam
}

interface Calls {
  snapshots: string[]
  fullscreens: HTMLElement[]
}

async function createPanel(
  calls: Calls,
  webcams: Webcam[] = [createWebcam()],
  properties: Partial<CameraPanel> = {},
): Promise<CameraPanel> {
  const panel = document.createElement('camera-panel') as CameraPanel
  panel.loadWebcams = async () => webcams
  panel.saveSnapshot = async (webcam) => void calls.snapshots.push(webcam.name)
  panel.openFullscreen = (element) => void calls.fullscreens.push(element)
  Object.assign(panel, properties)
  document.body.appendChild(panel)
  await new Promise((resolve) => setTimeout(resolve, 0))
  await panel.updateComplete
  return panel
}

function createCalls(): Calls {
  return { snapshots: [], fullscreens: [] }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('camera panel', () => {
  it('names the camera with its aspect ratio and frame rate', async () => {
    const panel = await createPanel(createCalls())
    expect(panel.querySelector('.camera-overlay')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Enclosure 4:3 · 15 fps',
    )
    expect(panel.querySelector('.camera-heading')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Enclosure 15 fps')
  })

  it('shows the stream of the camera', async () => {
    const panel = await createPanel(createCalls())
    expect(panel.querySelector('img.camera-stream')?.getAttribute('src')).toBe('/api/webcams/0/stream')
  })

  it('says the stream is not available when it cannot be loaded', async () => {
    const panel = await createPanel(createCalls())
    panel.querySelector('img.camera-stream')?.dispatchEvent(new Event('error'))
    await panel.updateComplete
    expect(panel.querySelector('img.camera-stream')).toBeNull()
    expect(panel.querySelector('.camera-unavailable')?.textContent).toBe('[Live camera stream]')
  })

  it('says the same without any camera', async () => {
    const panel = await createPanel(createCalls(), [])
    expect(panel.querySelector('.camera-unavailable')?.textContent).toBe('[Live camera stream]')
    expect(panel.querySelector('.camera-overlay')).toBeNull()
  })

  it('switches to the next camera and around again', async () => {
    const panel = await createPanel(createCalls(), [
      createWebcam(),
      createWebcam({ name: 'Toolhead', stream_url: '/two' }),
    ])
    panel.querySelector<HTMLElement>('button[aria-label="Switch camera"]')?.click()
    await panel.updateComplete
    expect(panel.querySelector('.camera-overlay')?.textContent).toContain('Toolhead')
    panel.querySelector<HTMLElement>('button[aria-label="Switch camera"]')?.click()
    await panel.updateComplete
    expect(panel.querySelector('.camera-overlay')?.textContent).toContain('Enclosure')
  })

  it('saves a snapshot of the camera that is shown', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls)
    panel.querySelector<HTMLElement>('button[aria-label="Save snapshot"]')?.click()
    expect(calls.snapshots).toEqual(['Enclosure'])
  })

  it('opens the viewport fullscreen', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls)
    panel.querySelector<HTMLElement>('button[aria-label="Open camera fullscreen"]')?.click()
    expect(calls.fullscreens).toEqual([panel.querySelector('.camera-viewport')])
  })
})
