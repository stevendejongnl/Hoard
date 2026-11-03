import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getDetectionAlerts, setDetectionVerdicts } from '../api'
import { describeAlertTime, formatPercent } from '../detection-view'
import type { DetectionAlert, DetectionVerdict } from '../types'
import '../components/detection-frame'
import '../styles/detection.css'

type Filter = DetectionVerdict | 'unlabelled' | ''
type LoadState = 'loading' | 'ready' | 'error'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: '', label: 'All alerts' },
  { value: 'unlabelled', label: 'No verdict yet' },
  { value: 'real', label: 'Real' },
  { value: 'false_alarm', label: 'False alarm' },
]

/** Every alert of a print that looked failed, with its frame, to be called real or a false alarm. */
@customElement('detections-page')
export class DetectionsPage extends LitElement {
  @property({ attribute: false }) loadAlerts: (verdict?: DetectionVerdict | 'unlabelled') => Promise<DetectionAlert[]> =
    getDetectionAlerts
  @property({ attribute: false }) saveVerdicts: (ids: number[], verdict: DetectionVerdict | null) => Promise<unknown> =
    setDetectionVerdicts
  @property({ type: String }) timeZone: string | undefined = undefined

  @state() private alerts: DetectionAlert[] = []
  @state() private filter: Filter = ''
  @state() private selectedIds: number[] = []
  @state() private loadState: LoadState = 'loading'
  @state() private saveFailed = false

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.load()
  }

  private async load(): Promise<void> {
    try {
      this.alerts = await this.loadAlerts(this.filter || undefined)
      const loadedIds = this.alerts.map((alert) => alert.id)
      this.selectedIds = this.selectedIds.filter((id) => loadedIds.includes(id))
      this.loadState = 'ready'
    } catch {
      this.loadState = 'error'
    }
  }

  private async setVerdict(ids: number[], verdict: DetectionVerdict | null): Promise<void> {
    try {
      await this.saveVerdicts(ids, verdict)
    } catch {
      this.saveFailed = true
      return
    }
    this.saveFailed = false
    this.selectedIds = this.selectedIds.filter((id) => !ids.includes(id))
    if (this.filter) return void (await this.load())
    this.alerts = this.alerts.map((alert) => (ids.includes(alert.id) ? { ...alert, verdict } : alert))
  }

  private toggleVerdict(alert: DetectionAlert, verdict: DetectionVerdict): void {
    void this.setVerdict([alert.id], alert.verdict === verdict ? null : verdict)
  }

  private toggleSelection(id: number): void {
    this.selectedIds = this.selectedIds.includes(id)
      ? this.selectedIds.filter((selected) => selected !== id)
      : [...this.selectedIds, id]
  }

  private toggleAllSelected(): void {
    const isEverythingSelected = this.selectedIds.length === this.alerts.length
    this.selectedIds = isEverythingSelected ? [] : this.alerts.map((alert) => alert.id)
  }

  private changeFilter(event: Event): void {
    this.filter = (event.target as HTMLSelectElement).value as Filter
    void this.load()
  }

  private renderVerdictButton(alert: DetectionAlert, verdict: DetectionVerdict, label: string): TemplateResult {
    const className = verdict === 'real' ? 'verdict-real' : 'verdict-false-alarm'
    return html`<button
      class="button small ${className} ${alert.verdict === verdict ? 'active' : ''}"
      @click=${() => this.toggleVerdict(alert, verdict)}
    >
      ${label}
    </button>`
  }

  private renderRow(alert: DetectionAlert): TemplateResult {
    return html`<tr data-alert=${alert.id}>
      <td>
        <input
          type="checkbox"
          class="row-select"
          aria-label="Select the alert of ${alert.filename}"
          .checked=${this.selectedIds.includes(alert.id)}
          @change=${() => this.toggleSelection(alert.id)}
        />
      </td>
      <td class="detection-thumbnail">
        <detection-frame .frameUrl=${alert.frame_url} .boxes=${alert.detections}></detection-frame>
      </td>
      <td class="detection-print">${alert.filename}</td>
      <td class="muted">${describeAlertTime(alert.created_at, this.timeZone)}</td>
      <td class="monospace">${formatPercent(alert.score)}</td>
      <td class="detection-verdicts">
        ${this.renderVerdictButton(alert, 'real', 'Real')}
        ${this.renderVerdictButton(alert, 'false_alarm', 'False alarm')}
      </td>
    </tr>`
  }

  private renderTable(): TemplateResult {
    return html`<div class="detections-table-wrapper">
      <table class="detections-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                class="select-all"
                aria-label="Select all alerts"
                .checked=${this.selectedIds.length === this.alerts.length}
                @change=${() => this.toggleAllSelected()}
              />
            </th>
            <th>Frame</th>
            <th>Print</th>
            <th>Time</th>
            <th>Score</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          ${this.alerts.map((alert) => this.renderRow(alert))}
        </tbody>
      </table>
    </div>`
  }

  private renderBulkButtons(): TemplateResult | typeof nothing {
    if (this.selectedIds.length === 0) return nothing
    return html`<span class="detections-bulk">
      <span class="muted">${this.selectedIds.length} selected</span>
      <button class="button small bulk-real" @click=${() => void this.setVerdict(this.selectedIds, 'real')}>
        Mark real
      </button>
      <button
        class="button small bulk-false-alarm"
        @click=${() => void this.setVerdict(this.selectedIds, 'false_alarm')}
      >
        Mark false alarm
      </button>
    </span>`
  }

  private renderStrip(): TemplateResult {
    return html`<div class="detections-strip">
      <span class="detections-title">Detections</span>
      <select class="value-field select-field verdict-filter" aria-label="Show" @change=${this.changeFilter}>
        ${FILTERS.map(
          (option) =>
            html`<option value=${option.value} ?selected=${option.value === this.filter}>${option.label}</option>`,
        )}
      </select>
      ${this.renderBulkButtons()}
      ${this.saveFailed ? html`<span class="detection-banner-error">Could not save the verdict</span>` : nothing}
    </div>`
  }

  private renderBody(): TemplateResult {
    if (this.loadState === 'loading') return html`<div class="state-message">Loading alerts…</div>`
    if (this.loadState === 'error') return html`<div class="state-message">Could not load the alerts</div>`
    if (this.alerts.length === 0) {
      const text = this.filter ? 'No alerts with this verdict' : 'No alerts yet'
      return html`<div class="state-message">${text}</div>`
    }
    return this.renderTable()
  }

  render(): TemplateResult {
    return html`<div class="detections-layout">${this.renderStrip()} ${this.renderBody()}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'detections-page': DetectionsPage
  }
}
