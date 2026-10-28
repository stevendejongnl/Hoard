import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getWebcams } from '../api'
import type { Webcam } from '../api'
import { renderIcon } from '../icons'

const UNAVAILABLE_TEXT = '[Live camera stream]'
const BUTTON_ICON_SIZE = 18

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

/** The live view of a printer camera, with the buttons to go fullscreen, save a snapshot and switch cameras. */
@customElement('camera-panel')
export class CameraPanel extends LitElement {
  @property({ attribute: false }) loadWebcams: () => Promise<Webcam[]> = getWebcams
  @property({ attribute: false }) saveSnapshot: (webcam: Webcam) => Promise<void> = downloadSnapshot
  @property({ attribute: false }) openFullscreen: (element: HTMLElement) => void = (element) =>
    void element.requestFullscreen?.()

  @state() private webcams: Webcam[] = []
  @state() private activeIndex = 0
  @state() private hasStreamFailed = false

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.loadAvailableWebcams()
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
    this.hasStreamFailed = false
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

  private renderStream(webcam: Webcam | null): TemplateResult {
    if (!webcam || this.hasStreamFailed) return html`<span class="camera-unavailable">${UNAVAILABLE_TEXT}</span>`
    return html`<img
      class="camera-stream"
      src=${webcam.stream_url}
      alt="Live view of ${webcam.name}"
      style="transform: ${describeFlip(webcam)}"
      @error=${() => (this.hasStreamFailed = true)}
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
        ${this.renderStream(webcam)} ${webcam ? this.renderOverlay(webcam) : nothing} ${this.renderButtons(webcam)}
      </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'camera-panel': CameraPanel
  }
}
