import { LitElement, html, nothing, svg } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { toTopLeftBox } from '../detection-view'
import type { DetectionBox } from '../types'
import '../styles/detection.css'

interface FrameSize {
  width: number
  height: number
}

/** A camera frame that was kept with an alert, with a box where the detector saw a failure. */
@customElement('detection-frame')
export class DetectionFrame extends LitElement {
  @property({ attribute: false }) frameUrl: string | null = null
  @property({ attribute: false }) boxes: DetectionBox[] = []

  /** The boxes are in pixels of the frame itself, so they can only be drawn once its size is known. */
  @state() private frameSize: FrameSize | null = null

  createRenderRoot() {
    return this
  }

  private measureFrame(event: Event): void {
    const image = event.target as HTMLImageElement
    this.frameSize = { width: image.naturalWidth, height: image.naturalHeight }
  }

  private renderBoxes(): TemplateResult | typeof nothing {
    if (!this.frameSize) return nothing
    const { width, height } = this.frameSize
    const drawable = this.boxes.flatMap((detection) => (detection.box ? [toTopLeftBox(detection.box)] : []))
    return html`<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${drawable.map((box) => svg`<rect x=${box.x} y=${box.y} width=${box.width} height=${box.height}></rect>`)}
    </svg>`
  }

  render(): TemplateResult {
    if (!this.frameUrl) return html`<span class="muted detection-no-frame">No frame kept</span>`
    return html`<img
        src=${this.frameUrl}
        alt="Camera frame of the alert"
        @load=${this.measureFrame}
      />${this.renderBoxes()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'detection-frame': DetectionFrame
  }
}
