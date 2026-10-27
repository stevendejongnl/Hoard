import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getFiles, getHistory, getSpools, predict } from '../api'
import { renderIcon } from '../icons'
import { formatPrintCost, formatPrintDuration, formatPrintFilament } from '../print-history-list'
import { buildSpoolName } from '../spool-list'
import type { GcodeFile, PredictResult, PrintRecord, Spool } from '../types'

const NO_VALUE = '—'
const RECENT_PRINT_LOOKUP_COUNT = 20
const CHEVRON_SIZE = 14
const SELECT_CHEVRON_SIZE = 12
const ICON_STROKE_WIDTH = 2.4

function removeExtension(filename: string): string {
  return filename.replace(/\.gcode$/i, '')
}

/** Estimates what printing a file costs on a spool: filament, time and the total. */
@customElement('cost-predictor-panel')
export class CostPredictorPanel extends LitElement {
  @property({ attribute: false }) loadFiles: () => Promise<GcodeFile[]> = getFiles
  @property({ attribute: false }) loadSpools: () => Promise<Spool[]> = getSpools
  @property({ attribute: false }) loadRecentPrints: () => Promise<PrintRecord[]> = () =>
    getHistory(RECENT_PRINT_LOOKUP_COUNT, 0).then((history) => history.records)
  @property({ attribute: false }) loadPrediction: (filename: string, spoolId: number | null) => Promise<PredictResult> =
    (filename, spoolId) => predict(filename, spoolId, 1)

  @state() private files: GcodeFile[] = []
  @state() private spools: Spool[] = []
  @state() private recentPrints: PrintRecord[] = []
  @state() private filename = ''
  @state() private spoolId: number | null = null
  @state() private prediction: PredictResult | null = null
  @state() private isOpen = true

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.loadChoices()
  }

  private async loadChoices(): Promise<void> {
    this.files = await this.loadFiles().catch(() => [])
    this.spools = await this.loadSpools().catch(() => [])
    this.recentPrints = await this.loadRecentPrints().catch(() => [])
    this.filename = this.files[0]?.filename ?? ''
    this.spoolId = this.pickDefaultSpoolId(this.filename)
    await this.refreshPrediction()
  }

  private pickDefaultSpoolId(filename: string): number | null {
    const lastPrint = this.recentPrints.find((record) => record.filename === filename)
    if (lastPrint?.spool?.id) return lastPrint.spool.id
    return this.spools.find((spool) => spool.active)?.id ?? this.spools[0]?.id ?? null
  }

  private async refreshPrediction(): Promise<void> {
    if (this.filename === '') return
    try {
      this.prediction = await this.loadPrediction(this.filename, this.spoolId)
    } catch {
      this.prediction = null
    }
  }

  private async changeFile(event: Event): Promise<void> {
    this.filename = (event.target as HTMLSelectElement).value
    await this.refreshPrediction()
  }

  private async changeSpool(event: Event): Promise<void> {
    this.spoolId = Number((event.target as HTMLSelectElement).value)
    await this.refreshPrediction()
  }

  private renderSelect(
    label: string,
    name: string,
    shownText: string,
    options: TemplateResult,
    onChange: (event: Event) => void,
  ) {
    return html`<label class="value-field select-field predictor-select">
      <span class="select-text" data-field=${name}>${shownText}</span>${renderIcon(
        'chevron-down',
        SELECT_CHEVRON_SIZE,
        ICON_STROKE_WIDTH,
      )}
      <select aria-label=${label} @change=${onChange}>
        ${options}
      </select>
    </label>`
  }

  private renderFileRow(): TemplateResult {
    const options = html`${this.files.map(
      (file) =>
        html`<option value=${file.filename} ?selected=${file.filename === this.filename}>
          ${removeExtension(file.filename)}
        </option>`,
    )}`
    return html`<div class="parameter-row">
      <span class="parameter-label">File</span>${this.renderSelect(
        'File',
        'file',
        removeExtension(this.filename),
        options,
        (event) => this.changeFile(event),
      )}
    </div>`
  }

  private renderSpoolRow(): TemplateResult {
    const current = this.spools.find((spool) => spool.id === this.spoolId)
    const options = html`${this.spools.map(
      (spool) =>
        html`<option value=${spool.id} ?selected=${spool.id === this.spoolId}>${buildSpoolName(spool)}</option>`,
    )}`
    return html`<div class="parameter-row">
      <span class="parameter-label">Spool</span>${this.renderSelect(
        'Spool',
        'spool',
        current ? buildSpoolName(current) : NO_VALUE,
        options,
        (event) => this.changeSpool(event),
      )}
    </div>`
  }

  private describeFilamentAndTime(): string {
    if (!this.prediction) return NO_VALUE
    const filament = formatPrintFilament(this.prediction.filament_g)
    return `${filament} · ${formatPrintDuration(this.prediction.estimated_time_s)}`
  }

  private renderResults(): TemplateResult {
    return html`<div class="parameter-row">
        <span class="parameter-label">Filament / time</span
        ><span class="value-field" data-field="filament-time">${this.describeFilamentAndTime()}</span>
      </div>
      <div class="parameter-row">
        <span class="parameter-label predictor-total-label">Total</span
        ><span class="value-field accented" data-field="total"
          >${this.prediction ? formatPrintCost(this.prediction.cost_total) : NO_VALUE}</span
        >
      </div>`
  }

  private renderBody(): TemplateResult | typeof nothing {
    if (!this.isOpen) return nothing
    if (this.files.length === 0) return html`<div class="predictor-message">No files on the printer</div>`
    return html`<div class="section-body predictor-body">
      ${this.renderFileRow()} ${this.renderSpoolRow()} ${this.renderResults()}
    </div>`
  }

  render(): TemplateResult {
    return html`<div class="section-header">
        <button
          class="predictor-toggle"
          aria-expanded=${this.isOpen ? 'true' : 'false'}
          @click=${() => (this.isOpen = !this.isOpen)}
        >
          ${renderIcon(this.isOpen ? 'chevron-down' : 'chevron-left', CHEVRON_SIZE, ICON_STROKE_WIDTH)}Cost predictor
        </button>
      </div>
      ${this.renderBody()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cost-predictor-panel': CostPredictorPanel
  }
}
