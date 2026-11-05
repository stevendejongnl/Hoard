import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getWebcams } from '../api'
import type { Webcam } from '../api'
import { captureFrame } from '../camera-frame-sample'
import { StreamWatchdog, reconnectDelayMilliseconds, withReconnectParameter } from '../camera-stream-watchdog'
import type { FrameSample } from '../camera-stream-watchdog'
import {
  DEFAULT_VIEW,
  chooseFit,
  combineWithCamera,
  createSnapshotPlan,
  describeObjectFit,
  describeTransform,
  flipView,
  isQuarterTurn,
  readStoredView,
  rotateView,
  storeView,
} from '../camera-view'
import type { CameraView, EffectiveOrientation, FitMode, ViewStorage } from '../camera-view'
import { renderIcon } from '../icons'

const UNAVAILABLE_TEXT = '[Live camera stream]'
const BUTTON_ICON_SIZE = 18
const WATCH_INTERVAL_MILLISECONDS = 500
const RATE_REFRESH_MILLISECONDS = 5000
/** a measured rate below this part of the target is shown as a problem */
const LOW_RATE_RATIO = 0.7
const JPEG_QUALITY = 0.92
const LOW_RATE_TEXT = 'The camera sends fewer frames than its target'

function startTickingEvery(callback: () => void): () => void {
  const timer = setInterval(callback, WATCH_INTERVAL_MILLISECONDS)
  return () => clearInterval(timer)
}

function refreshEveryFewSeconds(callback: () => void): () => void {
  const timer = setInterval(callback, RATE_REFRESH_MILLISECONDS)
  return () => clearInterval(timer)
}

function waitBeforeRetrying(callback: () => void, delay: number): () => void {
  const timer = setTimeout(callback, delay)
  return () => clearTimeout(timer)
}

function formatSnapshotTime(time: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`
  return `${date}-${pad(time.getHours())}-${pad(time.getMinutes())}-${pad(time.getSeconds())}`
}

/** Saves the picture of the camera turned and flipped as it is shown, as a JPEG named after the camera and the time. */
async function downloadSnapshot(webcam: Webcam, orientation: EffectiveOrientation): Promise<void> {
  const response = await fetch(webcam.snapshot_url)
  const picture = await createImageBitmap(await response.blob())
  const plan = createSnapshotPlan(picture.width, picture.height, orientation)
  const canvas = document.createElement('canvas')
  canvas.width = plan.width
  canvas.height = plan.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The picture cannot be drawn in this browser')
  context.translate(plan.width / 2, plan.height / 2)
  context.scale(plan.scaleX, plan.scaleY)
  context.rotate(plan.radians)
  context.drawImage(picture, -picture.width / 2, -picture.height / 2)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('The picture cannot be saved in this browser')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${webcam.name}-${formatSnapshotTime(new Date())}.jpg`
  link.click()
  URL.revokeObjectURL(link.href)
}

/** The storage of this browser, or one that forgets when the browser blocks it. */
function findViewStorage(): ViewStorage {
  try {
    return window.localStorage
  } catch {
    const values = new Map<string, string>()
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) }
  }
}

/**
 * The live view of a printer camera, with the buttons to go fullscreen, save a snapshot and switch cameras.
 * While the stream is black, stalled or failed it shows the last frame, and it loads the stream again by itself.
 */
@customElement('camera-panel')
export class CameraPanel extends LitElement {
  @property({ attribute: false }) loadWebcams: () => Promise<Webcam[]> = getWebcams
  @property({ attribute: false }) saveSnapshot: (webcam: Webcam, orientation: EffectiveOrientation) => Promise<void> =
    downloadSnapshot
  @property({ attribute: false }) viewStorage: ViewStorage = findViewStorage()
  @property({ attribute: false }) openFullscreen: (element: HTMLElement) => void = (element) =>
    void element.requestFullscreen?.()

  @property({ attribute: false }) now: () => number = () => Date.now()
  @property({ attribute: false }) captureFrame: (
    image: HTMLImageElement,
    canvas: HTMLCanvasElement,
  ) => FrameSample | null = captureFrame
  @property({ attribute: false }) repeatEvery: (callback: () => void) => () => void = refreshEveryFewSeconds
  @property({ attribute: false }) startTicking: (callback: () => void) => () => void = startTickingEvery
  @property({ attribute: false }) waitBeforeRetry: (callback: () => void, delay: number) => () => void =
    waitBeforeRetrying

  @state() private webcams: Webcam[] = []
  @state() private activeIndex = 0
  @state() private hasStreamFailed = false
  @state() private streamAttempt = 0
  @state() private views: Record<string, CameraView> = {}
  @state() private isViewMenuOpen = false
  @state() private hasLastFrame = false
  @state() private isShowingLastFrame = false

  private readonly watchdog = new StreamWatchdog()
  private isReconnecting = false
  private failureCount = 0
  private stopWatching: (() => void) | null = null
  private stopRefreshing: (() => void) | null = null
  private cancelRetry: (() => void) | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.loadAvailableWebcams()
    this.watchdog.reset(this.now())
    this.stopWatching = this.startTicking(() => this.watchStream())
    this.stopRefreshing = this.repeatEvery(() => void this.refreshWebcams())
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    document.addEventListener('keydown', this.handleKeyDown)
  }

  disconnectedCallback(): void {
    this.stopWatching?.()
    this.stopRefreshing?.()
    this.cancelRetry?.()
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    document.removeEventListener('keydown', this.handleKeyDown)
    super.disconnectedCallback()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.isViewMenuOpen = false
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

  /** the measured rate changes all the time; a failed read keeps what is shown */
  private async refreshWebcams(): Promise<void> {
    try {
      this.webcams = (await this.loadWebcams()).filter((webcam) => webcam.enabled !== false)
    } catch {
      // the cameras stay as they are: a failed refresh is not a reason to hide the picture
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

  private findView(webcam: Webcam | null): CameraView {
    if (!webcam) return DEFAULT_VIEW
    return this.views[webcam.name] ?? readStoredView(this.viewStorage, webcam.name)
  }

  private changeView(webcam: Webcam, change: (view: CameraView) => CameraView): void {
    const view = change(this.findView(webcam))
    this.views = { ...this.views, [webcam.name]: view }
    storeView(this.viewStorage, webcam.name, view)
  }

  private flipPicture(webcam: Webcam, axis: 'horizontal' | 'vertical'): void {
    this.changeView(webcam, (current) => flipView(current, axis))
  }

  /** the turns and flips of the camera with the ones of the person, as the picture and the snapshot show them */
  private findOrientation(webcam: Webcam): EffectiveOrientation {
    return combineWithCamera(webcam, this.findView(webcam))
  }

  private describePictureStyle(webcam: Webcam): string {
    const orientation = this.findOrientation(webcam)
    const placement = isQuarterTurn(orientation.rotation) ? 'translate(-50%, -50%) ' : ''
    return `object-fit: ${describeObjectFit(this.findView(webcam).fit)}; transform: ${placement}${describeTransform(orientation)}`
  }

  private openViewportFullscreen(): void {
    const viewport = this.querySelector<HTMLElement>('.camera-viewport')
    if (viewport) this.openFullscreen(viewport)
  }

  /** the measured rate with the target after it; the target as it was until a stream has been open for a moment */
  private renderFrameRate(webcam: Webcam): TemplateResult | typeof nothing {
    const measured = webcam.measured_fps
    const target = webcam.target_fps
    if (measured == null) return target ? html`${target} fps` : nothing
    const isLow = Boolean(target) && measured < (target as number) * LOW_RATE_RATIO
    const rate = isLow
      ? html`<span class="camera-rate-low" title=${LOW_RATE_TEXT}>${measured} fps</span>`
      : html`${measured} fps`
    return target ? html`${rate} · target ${target}` : rate
  }

  private renderOverlay(webcam: Webcam): TemplateResult {
    const separator = webcam.aspect_ratio && this.hasFrameRate(webcam) ? ' · ' : ''
    return html`<span class="camera-overlay"
      ><span class="live-dot"></span>${webcam.name}
      <span class="monospace muted camera-details"
        >${webcam.aspect_ratio}${separator}${this.renderFrameRate(webcam)}</span
      ></span
    >`
  }

  private hasFrameRate(webcam: Webcam): boolean {
    return webcam.measured_fps != null || Boolean(webcam.target_fps)
  }

  private renderHeading(webcam: Webcam): TemplateResult {
    return html`<div class="camera-heading">
      <span class="live-dot"></span>${webcam.name}
      <span class="monospace muted camera-details">${this.renderFrameRate(webcam)}</span>
    </div>`
  }

  private describeLastFrameStyle(webcam: Webcam): string {
    const orientation = this.findOrientation(webcam)
    const fit = describeObjectFit(this.findView(webcam).fit)
    return `object-fit: ${fit}; transform: translate(-50%, -50%) ${describeTransform(orientation)}`
  }

  private renderLastFrame(webcam: Webcam | null): TemplateResult | typeof nothing {
    if (!webcam) return nothing
    return html`<canvas
      class="camera-last-frame"
      ?hidden=${!this.isShowingLastFrame}
      style=${this.describeLastFrameStyle(webcam)}
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
      style=${this.describePictureStyle(webcam)}
      @error=${() => this.failStream()}
    />`
  }

  private renderButton(label: string, icon: Parameters<typeof renderIcon>[0], onClick: () => void): TemplateResult {
    return html`<button class="button icon-only flat" aria-label=${label} @click=${onClick}>
      ${renderIcon(icon, BUTTON_ICON_SIZE)}
    </button>`
  }

  private renderViewButton(): TemplateResult {
    return html`<button
      class="button icon-only flat"
      aria-label="Camera view"
      aria-expanded=${this.isViewMenuOpen ? 'true' : 'false'}
      @click=${() => (this.isViewMenuOpen = !this.isViewMenuOpen)}
    >
      ${renderIcon('sliders', BUTTON_ICON_SIZE)}
    </button>`
  }

  private renderButtons(webcam: Webcam | null): TemplateResult {
    const hasSeveralCameras = this.webcams.length > 1
    return html`<div class="camera-buttons">
      ${this.renderButton('Open camera fullscreen', 'expand', () => this.openViewportFullscreen())}
      ${this.renderButton(
        'Save snapshot',
        'camera',
        () => webcam && void this.saveSnapshot(webcam, this.findOrientation(webcam)),
      )}
      ${hasSeveralCameras ? this.renderButton('Switch camera', 'repeat', () => this.switchCamera()) : nothing}
      ${webcam ? this.renderViewButton() : nothing}
    </div>`
  }

  private renderFitButton(webcam: Webcam, view: CameraView, fit: FitMode, label: string): TemplateResult {
    return html`<button
      class="button"
      data-fit=${fit}
      aria-pressed=${view.fit === fit ? 'true' : 'false'}
      @click=${() => this.changeView(webcam, (current) => chooseFit(current, fit))}
    >
      ${label}
    </button>`
  }

  private renderViewAction(
    action: string,
    label: string,
    spokenLabel: string,
    icon: Parameters<typeof renderIcon>[0],
    isPressed: boolean | null,
    onClick: () => void,
  ): TemplateResult {
    return html`<button
      class="button"
      data-action=${action}
      aria-label=${spokenLabel}
      aria-pressed=${isPressed === null ? nothing : String(isPressed)}
      @click=${onClick}
    >
      ${renderIcon(icon, BUTTON_ICON_SIZE)}${label}
    </button>`
  }

  private renderViewMenu(webcam: Webcam | null): TemplateResult | typeof nothing {
    if (!webcam || !this.isViewMenuOpen) return nothing
    const view = this.findView(webcam)
    return html`<div class="camera-view-menu" role="group" aria-label="Camera view">
      <div class="camera-view-group">
        ${this.renderFitButton(webcam, view, 'fit', 'Fit')} ${this.renderFitButton(webcam, view, 'fill', 'Fill')}
        ${this.renderFitButton(webcam, view, 'stretch', 'Stretch')}
      </div>
      <div class="camera-view-group">
        ${this.renderViewAction('rotate', 'Rotate', 'Rotate a quarter turn', 'refresh', null, () =>
          this.changeView(webcam, rotateView),
        )}
        ${this.renderViewAction(
          'flip-horizontal',
          'Flip H',
          'Flip horizontally',
          'flip-horizontal',
          view.flipHorizontal,
          () => this.flipPicture(webcam, 'horizontal'),
        )}
        ${this.renderViewAction('flip-vertical', 'Flip V', 'Flip vertically', 'flip-vertical', view.flipVertical, () =>
          this.flipPicture(webcam, 'vertical'),
        )}
      </div>
    </div>`
  }

  render(): TemplateResult {
    const webcam = this.findActiveWebcam()
    const view = this.findView(webcam)
    const isQuarter = webcam ? isQuarterTurn(this.findOrientation(webcam).rotation) : false
    return html`${webcam ? this.renderHeading(webcam) : nothing}
      <div class="camera-viewport" data-fit=${view.fit} data-quarter=${isQuarter ? 'true' : nothing}>
        ${this.renderLastFrame(webcam)} ${this.renderStream(webcam)} ${webcam ? this.renderOverlay(webcam) : nothing}
        ${this.renderButtons(webcam)} ${this.renderViewMenu(webcam)}
      </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'camera-panel': CameraPanel
  }
}
