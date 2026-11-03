import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getDetection, getDetectionAlerts, pausePrint, setDetectionVerdicts } from '../api'
import { formatPercent } from '../detection-view'
import { sseClient } from '../sse'
import type { DetectionAlert, DetectionState, DetectionStatus, DetectionVerdict } from '../types'
import './detection-frame'
import '../styles/detection.css'

type StopFunction = () => void
type UpdatePayload = { type: string; data: unknown }

const PRINTING_STATE = 'printing'

/** Above every page while a print looks failed and no verdict was given: is it real, or a false alarm? */
@customElement('detection-banner')
export class DetectionBanner extends LitElement {
  @property({ attribute: false }) loadStatus: () => Promise<DetectionStatus> = getDetection
  @property({ attribute: false }) loadAlerts: (verdict?: DetectionVerdict | 'unlabelled') => Promise<DetectionAlert[]> =
    getDetectionAlerts
  @property({ attribute: false }) saveVerdicts: (ids: number[], verdict: DetectionVerdict | null) => Promise<unknown> =
    setDetectionVerdicts
  @property({ attribute: false }) pause: () => Promise<unknown> = pausePrint
  @property({ attribute: false }) subscribeToUpdates: (handler: (payload: UpdatePayload) => void) => StopFunction = (
    handler,
  ) => sseClient.subscribe(handler)
  @property({ type: String, attribute: 'printerstate' }) printerState = ''

  @state() private alert: DetectionAlert | null = null
  @state() private saveFailed = false

  private stopListening: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.stopListening = this.subscribeToUpdates((payload) => this.receive(payload))
    void this.loadInitialState()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopListening?.()
  }

  private async loadInitialState(): Promise<void> {
    try {
      const status = await this.loadStatus()
      if (status.configured) await this.followState(status.state)
    } catch {
      this.alert = null
    }
  }

  private receive(payload: UpdatePayload): void {
    if (payload.type !== 'detection') return
    void this.followState((payload.data as { state: DetectionState }).state)
  }

  private async followState(state: DetectionState): Promise<void> {
    if (state !== 'alert') {
      this.alert = null
      return
    }
    await this.showNewestUnlabelledAlert()
  }

  private async showNewestUnlabelledAlert(): Promise<void> {
    try {
      const [newest] = await this.loadAlerts('unlabelled')
      this.alert = newest ?? null
    } catch {
      this.alert = null
    }
  }

  private async answer(alert: DetectionAlert, verdict: DetectionVerdict): Promise<void> {
    try {
      await this.saveVerdicts([alert.id], verdict)
      this.saveFailed = false
      this.alert = null
    } catch {
      this.saveFailed = true
    }
  }

  protected willUpdate(): void {
    this.hidden = this.alert === null
  }

  private renderPauseButton(): TemplateResult | typeof nothing {
    if (this.printerState !== PRINTING_STATE) return nothing
    return html`<button class="button small danger" @click=${() => void this.pause()}>Pause print</button>`
  }

  render(): TemplateResult | typeof nothing {
    const alert = this.alert
    if (!alert) return nothing
    return html`<div class="detection-banner-body" role="alert">
      <span class="detection-light error"></span>
      <detection-frame .frameUrl=${alert.frame_url} .boxes=${alert.detections}></detection-frame>
      <span class="detection-banner-text">
        <strong>${alert.filename}</strong> looks failed (${formatPercent(alert.score)})
        ${this.saveFailed ? html`<span class="detection-banner-error">Could not save the verdict</span>` : nothing}
      </span>
      <span class="detection-banner-actions">
        <button class="button small" @click=${() => void this.answer(alert, 'real')}>Real</button>
        <button class="button small" @click=${() => void this.answer(alert, 'false_alarm')}>False alarm</button>
        ${this.renderPauseButton()}
      </span>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'detection-banner': DetectionBanner
  }
}
