import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getWebcams } from '../api'
import type { Webcam } from '../api'
import { captureFrame } from '../camera-frame-sample'
import { StreamWatchdog, reconnectDelayMilliseconds, withReconnectParameter } from '../camera-stream-watchdog'
import type { FrameSample } from '../camera-stream-watchdog'
import { renderIcon } from '../icons'

const UNAVAILABLE_TEXT = '[Live camera stream]'
const BUTTON_ICON_SIZE = 18
const WATCH_INTERVAL_MILLISECONDS = 500

function startTickingEvery(callback: () => void): () => void {
  const timer = setInterval(callback, WATCH_INTERVAL_MILLISECONDS)
  return () => clearInterval(timer)
}

function waitBeforeRetrying(callback: () => void, delay: number): () => void {
  const timer = setTimeout(callback, delay)
  return () => clearTimeout(timer)
}

async function downloadSnapshot(webcam: Webcam): Promise<void> {
  const response = await fetch(webcam.snapshot_url)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(await response.blob())
  link.download = `${webcam.name}-${Date.now()}.jpg`
  link.click()
  URL.revokeObjectURL(link.href)
}

function describeFlip(webcam: Webcam): string {
  const horizontal = webcam.flip_horizontal ? -1 : 1
  const vertical = webcam.flip_vertical ? -1 : 1
  return `scale(${horizontal}, ${vertical}) rotate(${webcam.rotation ?? 0}deg)`
}

/**
 * The live view of a printer camera, with the buttons to go fullscreen, save a snapshot and switch cameras.
 * While the stream is black, stalled or failed it shows the last frame, and it loads the stream again by itself.
 */
@customElement('camera-panel')
export class CameraPanel extends LitElement {
  @property({ attribute: false }) loadWebcams: () => Promise<Webcam[]> = getWebcams
  @property({ attribute: false }) saveSnapshot: (webcam: Webcam) => Promise<void> = downloadSnapshot
  @property({ attribute: false }) openFullscreen: (element: HTMLElement) => void = (element) =>
    void element.requestFullscreen?.()

  @property({ attribute: false }) now: () => number = () => Date.now()
  @property({ attribute: false }) captureFrame: (
    image: HTMLImageElement,
    canvas: HTMLCanvasElement,
  ) => FrameSample | null = captureFrame
  @property({ attribute: false }) startTicking: (callback: () => void) => () => void = startTickingEvery
  @property({ attribute: false }) waitBeforeRetry: (callback: () => void, delay: number) => () => void =
    waitBeforeRetrying

  @state() private webcams: Webcam[] = []
  @state() private activeIndex = 0
  @state() private hasStreamFailed = false
  @state() private streamAttempt = 0
  @state() private hasLastFrame = false
  @state() private isShowingLastFrame = false

  private readonly watchdog = new StreamWatchdog()
  private isReconnecting = false
  private failureCount = 0
  private stopWatching: (() => void) | null = null
  private cancelRetry: (() => void) | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.loadAvailableWebcams()
    this.watchdog.reset(this.now())
    this.stopWatching = this.startTicking(() => this.watchStream())
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  disconnectedCallback(): void {
    this.stopWatching?.()
    this.cancelRetry?.()
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    super.disconnectedCallback()
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.reconnect()
  }

  private watchStream(): void {
    const image = this.querySelector<HTMLImageElement>('img.camera-stream')
    const canvas = this.querySelector<HTMLCanvasElement>('canvas.camera-last-frame')
    if (!canvas) return
    this.noteSample(image ? this.captureFrame(image, canvas) : null)
  }

  private noteSample(sample: FrameSample | null): void {
    const observation = this.watchdog.observe(sample, this.now())
    if (sample && !sample.isBlank) this.hasLastFrame = true
    if (observation.hasNewFrame) this.noteNewFrame()
    if (observation.shouldReconnect) this.reconnect()
    this.isShowingLastFrame = this.hasLastFrame && (observation.isStale || this.isReconnecting)
  }

  private noteNewFrame(): void {
    this.failureCount = 0
    this.isReconnecting = false
  }

  private reconnect(): void {
    this.cancelRetry?.()
    this.cancelRetry = null
    this.streamAttempt += 1
    this.hasStreamFailed = false
    this.isReconnecting = true
    this.isShowingLastFrame = this.hasLastFrame
    this.watchdog.reset(this.now())
  }

  private failStream(): void {
    this.hasStreamFailed = true
    this.isShowingLastFrame = this.hasLastFrame
    this.cancelRetry = this.waitBeforeRetry(() => this.reconnect(), reconnectDelayMilliseconds(this.failureCount))
    this.failureCount += 1
  }

  private async loadAvailableWebcams(): Promise<void> {
    try {
      this.webcams = (await this.loadWebcams()).filter((webcam) => webcam.enabled !== false)
    } catch {
      this.webcams = []
    }
  }

  private findActiveWebcam(): Webcam | null {
    return this.webcams[this.activeIndex] ?? null
  }

  private switchCamera(): void {
    this.activeIndex = (this.activeIndex + 1) % Math.max(this.webcams.length, 1)
    this.cancelRetry?.()
    this.cancelRetry = null
    this.hasStreamFailed = false
    this.streamAttempt = 0
    this.hasLastFrame = false
    this.isShowingLastFrame = false
    this.isReconnecting = false
    this.failureCount = 0
    this.watchdog.reset(this.now())
  }

  private openViewportFullscreen(): void {
    const viewport = this.querySelector<HTMLElement>('.camera-viewport')
    if (viewport) this.openFullscreen(viewport)
  }

  private describeFrameRate(webcam: Webcam): string {
    return webcam.target_fps ? `${webcam.target_fps} fps` : ''
  }

  private renderOverlay(webcam: Webcam): TemplateResult {
    const details = [webcam.aspect_ratio, this.describeFrameRate(webcam)].filter(Boolean).join(' · ')
    return html`<span class="camera-overlay"
      ><span class="live-dot"></span>${webcam.name} <span class="monospace muted camera-details">${details}</span></span
    >`
  }

  private renderHeading(webcam: Webcam): TemplateResult {
    return html`<div class="camera-heading">
      <span class="live-dot"></span>${webcam.name}
      <span class="monospace muted camera-details">${this.describeFrameRate(webcam)}</span>
    </div>`
  }

  private renderLastFrame(webcam: Webcam | null): TemplateResult | typeof nothing {
    if (!webcam) return nothing
    return html`<canvas
      class="camera-last-frame"
      ?hidden=${!this.isShowingLastFrame}
      style="transform: translate(-50%, -50%) ${describeFlip(webcam)}"
    ></canvas>`
  }

  private renderStream(webcam: Webcam | null): TemplateResult | typeof nothing {
    if (!webcam) return html`<span class="camera-unavailable">${UNAVAILABLE_TEXT}</span>`
    if (!this.hasStreamFailed) return this.renderStreamImage(webcam)
    return this.hasLastFrame ? nothing : html`<span class="camera-unavailable">${UNAVAILABLE_TEXT}</span>`
  }

  private renderStreamImage(webcam: Webcam): TemplateResult {
    return html`<img
      class="camera-stream"
      src=${withReconnectParameter(webcam.stream_url, this.streamAttempt)}
      alt="Live view of ${webcam.name}"
      style="transform: ${describeFlip(webcam)}"
      @error=${() => this.failStream()}
    />`
  }

  private renderButton(label: string, icon: Parameters<typeof renderIcon>[0], onClick: () => void): TemplateResult {
    return html`<button class="button icon-only flat" aria-label=${label} @click=${onClick}>
      ${renderIcon(icon, BUTTON_ICON_SIZE)}
    </button>`
  }

  private renderButtons(webcam: Webcam | null): TemplateResult {
    return html`<div class="camera-buttons">
      ${this.renderButton('Open camera fullscreen', 'expand', () => this.openViewportFullscreen())}
      ${this.renderButton('Save snapshot', 'camera', () => webcam && void this.saveSnapshot(webcam))}
      ${this.renderButton('Switch camera', 'refresh', () => this.switchCamera())}
    </div>`
  }

  render(): TemplateResult {
    const webcam = this.findActiveWebcam()
    return html`${webcam ? this.renderHeading(webcam) : nothing}
      <div class="camera-viewport">
        ${this.renderLastFrame(webcam)} ${this.renderStream(webcam)} ${webcam ? this.renderOverlay(webcam) : nothing}
        ${this.renderButtons(webcam)}
      </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'camera-panel': CameraPanel
  }
}
