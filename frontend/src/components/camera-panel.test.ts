import { afterEach, describe, expect, it } from 'vitest'
import type { Webcam } from '../api'
import type { FrameSample } from '../camera-stream-watchdog'
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

class FakeCameraEnvironment {
  time = 0
  nextFrame: FrameSample | null = null
  captures: { image: HTMLImageElement; canvas: HTMLCanvasElement }[] = []
  tickers: (() => void)[] = []
  stoppedTickers = 0
  retries: { callback: () => void; delay: number; isCancelled: boolean }[] = []

  now = () => this.time

  captureFrame = (image: HTMLImageElement, canvas: HTMLCanvasElement) => {
    this.captures.push({ image, canvas })
    return this.nextFrame
  }

  startTicking = (callback: () => void) => {
    this.tickers.push(callback)
    return () => void this.stoppedTickers++
  }

  waitBeforeRetry = (callback: () => void, delay: number) => {
    const retry = { callback, delay, isCancelled: false }
    this.retries.push(retry)
    return () => void (retry.isCancelled = true)
  }

  async tick(panel: CameraPanel, frame: FrameSample | null, elapsed = 500): Promise<void> {
    this.time += elapsed
    this.nextFrame = frame
    this.tickers.forEach((callback) => callback())
    await panel.updateComplete
  }
}

function createFrame(signature: string, isBlank = false): FrameSample {
  return { signature, isBlank }
}

async function createWatchedPanel(environment: FakeCameraEnvironment, webcams?: Webcam[]): Promise<CameraPanel> {
  return createPanel(createCalls(), webcams, {
    now: environment.now,
    captureFrame: environment.captureFrame,
    startTicking: environment.startTicking,
    waitBeforeRetry: environment.waitBeforeRetry,
  })
}

function findLastFrame(panel: CameraPanel): HTMLCanvasElement {
  return panel.querySelector<HTMLCanvasElement>('canvas.camera-last-frame')!
}

function findStreamAddress(panel: CameraPanel): string | null | undefined {
  return panel.querySelector('img.camera-stream')?.getAttribute('src')
}

async function failStream(panel: CameraPanel): Promise<void> {
  panel.querySelector('img.camera-stream')?.dispatchEvent(new Event('error'))
  await panel.updateComplete
}

async function runLatestRetry(panel: CameraPanel, environment: FakeCameraEnvironment): Promise<void> {
  environment.retries[environment.retries.length - 1].callback()
  await panel.updateComplete
}

describe('the last frame of the camera', () => {
  it('has a canvas for it, hidden until a frame was captured', async () => {
    const panel = await createWatchedPanel(new FakeCameraEnvironment())
    expect(findLastFrame(panel).hidden).toBe(true)
  })

  it('captures the frame of the stream into that canvas on every tick', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, createFrame('a'))
    expect(environment.captures).toEqual([
      { image: panel.querySelector('img.camera-stream'), canvas: findLastFrame(panel) },
    ])
  })

  it('keeps the canvas hidden while the frames keep changing', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, createFrame('a'), 1000)
    await environment.tick(panel, createFrame('b'), 1000)
    await environment.tick(panel, createFrame('c'), 1000)
    expect(findLastFrame(panel).hidden).toBe(true)
  })

  it('shows the last frame when the frames stop changing', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, createFrame('a'), 0)
    await environment.tick(panel, createFrame('a'), 2000)
    expect(findLastFrame(panel).hidden).toBe(false)
  })

  it('shows the last frame when the stream goes blank', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, createFrame('a'), 0)
    await environment.tick(panel, createFrame('black', true), 2000)
    expect(findLastFrame(panel).hidden).toBe(false)
  })

  it('shows nothing extra when no frame was ever captured', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, null, 5000)
    expect(findLastFrame(panel).hidden).toBe(true)
  })

  it('hides the last frame again when a new frame arrives', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, createFrame('a'), 0)
    await environment.tick(panel, createFrame('a'), 2000)
    await environment.tick(panel, createFrame('b'), 500)
    expect(findLastFrame(panel).hidden).toBe(true)
  })

  it('forgets the last frame of a camera when it switches to the next camera', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment, [
      createWebcam(),
      createWebcam({ name: 'Toolhead', stream_url: '/two' }),
    ])
    await environment.tick(panel, createFrame('a'), 0)
    await environment.tick(panel, createFrame('a'), 2000)
    panel.querySelector<HTMLElement>('button[aria-label="Switch camera"]')?.click()
    await panel.updateComplete
    expect(findLastFrame(panel).hidden).toBe(true)
  })
})

describe('the camera going back to live', () => {
  it('loads the stream again when the frames stay the same for a long time', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, createFrame('a'), 0)
    await environment.tick(panel, createFrame('a'), 8000)
    expect(findStreamAddress(panel)).toBe('/api/webcams/0/stream?reconnect=1')
  })

  it('keeps showing the last frame while the stream loads again, until a new frame arrives', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, createFrame('a'), 0)
    await environment.tick(panel, createFrame('a'), 8000)
    await environment.tick(panel, null, 500)
    expect(findLastFrame(panel).hidden).toBe(false)
    await environment.tick(panel, createFrame('b'), 500)
    expect(findLastFrame(panel).hidden).toBe(true)
  })

  it('shows the last frame instead of the text when the stream fails, and loads it again after a second', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await environment.tick(panel, createFrame('a'), 0)
    await failStream(panel)
    expect(findLastFrame(panel).hidden).toBe(false)
    expect(panel.querySelector('.camera-unavailable')).toBeNull()
    expect(environment.retries.map((retry) => retry.delay)).toEqual([1000])
    await runLatestRetry(panel, environment)
    expect(findStreamAddress(panel)).toBe('/api/webcams/0/stream?reconnect=1')
  })

  it('waits longer after every failure', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await failStream(panel)
    await runLatestRetry(panel, environment)
    await failStream(panel)
    await runLatestRetry(panel, environment)
    await failStream(panel)
    expect(environment.retries.map((retry) => retry.delay)).toEqual([1000, 2000, 4000])
  })

  it('starts again from one second after the stream delivered a frame', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await failStream(panel)
    await runLatestRetry(panel, environment)
    await environment.tick(panel, createFrame('a'))
    await failStream(panel)
    expect(environment.retries.map((retry) => retry.delay)).toEqual([1000, 1000])
  })

  it('still says the stream is not available when it fails before any frame', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await failStream(panel)
    expect(panel.querySelector('.camera-unavailable')?.textContent).toBe('[Live camera stream]')
  })

  it('loads the stream again at once when the page becomes visible again', async () => {
    const panel = await createWatchedPanel(new FakeCameraEnvironment())
    document.dispatchEvent(new Event('visibilitychange'))
    await panel.updateComplete
    expect(findStreamAddress(panel)).toBe('/api/webcams/0/stream?reconnect=1')
  })

  it('does nothing when the page becomes hidden', async () => {
    const panel = await createWatchedPanel(new FakeCameraEnvironment())
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    delete (document as { visibilityState?: string }).visibilityState
    await panel.updateComplete
    expect(findStreamAddress(panel)).toBe('/api/webcams/0/stream')
  })

  it('stops watching and retrying when it is removed', async () => {
    const environment = new FakeCameraEnvironment()
    const panel = await createWatchedPanel(environment)
    await failStream(panel)
    panel.remove()
    expect(environment.stoppedTickers).toBe(1)
    expect(environment.retries.map((retry) => retry.isCancelled)).toEqual([true])
  })
})
