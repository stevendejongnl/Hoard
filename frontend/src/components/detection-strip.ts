import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getDetection } from '../api'
import { describeDetectionState, describeFrameRule, findStateTone, formatPercent } from '../detection-view'
import { followNavigationLink } from '../navigation'
import { router } from '../router'
import type { Route } from '../router'
import { sseClient } from '../sse'
import type { DetectionStatus } from '../types'
import '../styles/detection.css'

type StopFunction = () => void
type UpdatePayload = { type: string; data: unknown }

const DETECTIONS_PATH = '/detections'

/** One line under the camera: whether the print is being watched for failure, and the latest score. */
@customElement('detection-strip')
export class DetectionStrip extends LitElement {
  @property({ attribute: false }) loadStatus: () => Promise<DetectionStatus> = getDetection
  @property({ attribute: false }) subscribeToUpdates: (handler: (payload: UpdatePayload) => void) => StopFunction = (
    handler,
  ) => sseClient.subscribe(handler)
  @property({ attribute: false }) navigate: (path: string) => void = (path) => router.navigate(path as Route)

  @state() private status: DetectionStatus | null = null

  private stopListening: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.stopListening = this.subscribeToUpdates((payload) => this.receive(payload))
    void this.load()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopListening?.()
  }

  private async load(): Promise<void> {
    try {
      this.status = await this.loadStatus()
    } catch {
      this.status = null
    }
  }

  private receive(payload: UpdatePayload): void {
    if (payload.type !== 'detection' || !this.status) return
    const { state, score } = payload.data as Pick<DetectionStatus, 'state' | 'score'>
    this.status = { ...this.status, state, score }
  }

  protected willUpdate(): void {
    this.hidden = !this.status?.configured
  }

  render(): TemplateResult | typeof nothing {
    const status = this.status
    if (!status?.configured) return nothing
    return html`<span class="detection-light ${findStateTone(status.state)}"></span>
      <span class="detection-state">${describeDetectionState(status.state)}</span>
      ${status.score === null ? nothing : html`<span class="monospace">score ${formatPercent(status.score)}</span>`}
      <span class="muted"
        >limit ${formatPercent(status.settings.threshold)} · ${describeFrameRule(status.settings)}</span
      >
      <a
        class="detection-strip-link"
        href=${DETECTIONS_PATH}
        @click=${(click: MouseEvent) => followNavigationLink(click, DETECTIONS_PATH, this.navigate)}
        >Detections ›</a
      >`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'detection-strip': DetectionStrip
  }
}
