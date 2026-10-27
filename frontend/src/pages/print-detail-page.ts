import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getPrintJob, restoreCost as restoreCostRequest, updatePrintJob } from '../api'
import { renderIcon } from '../icons'
import { formatPrintCost, formatPrintDate, formatPrintDuration, formatPrintFilament } from '../print-history-list'
import { router } from '../router'
import type { PrintJob } from '../types'
import '../components/markdown-editor'
import '../components/print-photos'
import '../styles/print-detail.css'

type LoadState = 'loading' | 'ready' | 'error'

const NO_VALUE = '—'
const SECTION_CHEVRON_SIZE = 14
const ICON_STROKE_WIDTH = 2.4

function readJobIdFromRoute(): string {
  return decodeURIComponent(router.current.split('/')[2] ?? '')
}

function describeNumber(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? NO_VALUE : `${value}${unit}`
}

/** One finished print: its facts and slicer settings, its photos and notes, and what it cost. */
@customElement('print-detail-page')
export class PrintDetailPage extends LitElement {
  @property({ attribute: false }) readJobId: () => string = readJobIdFromRoute
  @property({ attribute: false }) loadJob: (jobId: string) => Promise<PrintJob> = getPrintJob
  @property({ attribute: false }) saveNotes: (jobId: string, notes: string) => Promise<unknown> = (jobId, notes) =>
    updatePrintJob(jobId, { notes })
  @property({ attribute: false }) restoreCost: (jobId: string) => Promise<Partial<PrintJob>> = (jobId) =>
    restoreCostRequest(jobId) as Promise<Partial<PrintJob>>
  @property({ attribute: false }) startPrint: (filename: string) => void = (filename) =>
    document.querySelector<HTMLElement & { tryPrint(name: string): void }>('print-ready-modal')?.tryPrint(filename)
  @property({ attribute: false }) navigate: (path: string) => void = (path) =>
    router.navigate(path as Parameters<typeof router.navigate>[0])

  @state() private job: PrintJob | null = null
  @state() private loadState: LoadState = 'loading'
  @state() private isRestoring = false

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.load()
  }

  private async load(): Promise<void> {
    try {
      this.job = await this.loadJob(this.readJobId())
      this.loadState = 'ready'
    } catch {
      this.loadState = 'error'
    }
  }

  private async restore(): Promise<void> {
    if (!this.job || this.isRestoring) return
    this.isRestoring = true
    try {
      this.job = { ...this.job, ...(await this.restoreCost(this.job.job_id)) }
    } finally {
      this.isRestoring = false
    }
  }

  private renderSectionHeader(title: string): TemplateResult {
    return html`<div class="section-header">
      ${renderIcon('chevron-down', SECTION_CHEVRON_SIZE, ICON_STROKE_WIDTH)}${title}
    </div>`
  }

  private renderField(label: string, name: string, value: string, unit = ''): TemplateResult {
    const unitText = unit === '' ? nothing : html`<span class="value-unit">${unit}</span>`
    return html`<div class="parameter-row">
      <span class="parameter-label">${label}</span
      ><span class="value-field" data-field=${name}>${value}${unitText}</span>
    </div>`
  }

  private renderDetailRow(label: string, name: string, content: TemplateResult | string): TemplateResult {
    return html`<div class="parameter-row">
      <span class="parameter-label">${label}</span><span class="detail-value" data-field=${name}>${content}</span>
    </div>`
  }

  private renderProjectLink(job: PrintJob): TemplateResult | string {
    if (!job.project) return NO_VALUE
    const project = job.project
    return html`<a
      href="/projects/${project.id}"
      @click=${(event: Event) => {
        event.preventDefault()
        this.navigate(`/projects/${project.id}`)
      }}
      >${project.name}</a
    >`
  }

  private renderFacts(job: PrintJob): TemplateResult {
    const spoolName = job.spool ? `${job.spool.brand ?? ''} ${job.spool.material ?? ''}`.trim() : NO_VALUE
    return html`<div class="section">
      ${this.renderSectionHeader('Job')}
      <div class="section-body">
        ${this.renderField('Duration', 'duration', formatPrintDuration(job.duration_s ?? 0))}
        ${this.renderField('Filament', 'filament', (job.filament_g ?? 0).toFixed(1), 'g')}
        ${this.renderDetailRow('Spool', 'spool', spoolName)}
        ${this.renderDetailRow('Project', 'project', this.renderProjectLink(job))}
      </div>
    </div>`
  }

  private renderSlicer(job: PrintJob): TemplateResult | typeof nothing {
    const meta = job.gcode_meta
    if (!meta) return nothing
    return html`<div class="section">
      ${this.renderSectionHeader('Slicer')}
      <div class="section-body">
        ${this.renderField('Layer height', 'layer-height', describeNumber(meta.layer_height, ''), 'mm')}
        ${this.renderField('Nozzle', 'nozzle', describeNumber(meta.nozzle_diameter, ''), 'mm')}
        ${this.renderField('Filament type', 'filament-type', meta.filament_type ?? NO_VALUE)}
        ${this.renderField('Nozzle temp', 'nozzle-temperature', describeNumber(meta.nozzle_temp, ''), '°C')}
        ${this.renderField('Bed temp', 'bed-temperature', describeNumber(meta.bed_temp, ''), '°C')}
      </div>
    </div>`
  }

  private renderCost(job: PrintJob): TemplateResult {
    const price =
      job.avg_eur_per_kwh === null || job.avg_eur_per_kwh === undefined ? NO_VALUE : job.avg_eur_per_kwh.toFixed(3)
    const power = job.avg_watts === null || job.avg_watts === undefined ? NO_VALUE : String(Math.round(job.avg_watts))
    return html`<div class="section">
      ${this.renderSectionHeader('Cost')}
      <div class="section-body">
        ${this.renderField('Filament', 'filament-cost', formatPrintCost(job.cost_filament ?? null))}
        ${this.renderField('Electricity', 'electricity-cost', formatPrintCost(job.cost_electricity ?? null))}
        ${this.renderField('Avg power', 'average-power', power, 'W')}
        ${this.renderField('Price', 'price', price, '€/kWh')}
        <div class="parameter-row">
          <span class="parameter-label"><strong>Total</strong></span>
          <span class="value-field accented" data-field="total">${formatPrintCost(job.cost_total ?? null)}</span>
        </div>
      </div>
    </div>`
  }

  private renderMain(job: PrintJob): TemplateResult {
    return html`<section class="detail-main" aria-label="Main">
      <div class="detail-title-strip">
        <button class="button small flat back-button" @click=${() => this.navigate('/history')}>
          ${renderIcon('chevron-left', 14)}History
        </button>
        <span class="detail-file monospace">${job.filename}</span>
        <span class="detail-date muted">${formatPrintDate(job.time ?? null)}</span>
      </div>
      <div class="detail-scroll">
        <div class="section">
          ${this.renderSectionHeader('Photos')}
          <div class="section-body detail-photos">
            <print-photos .jobId=${job.job_id} .photos=${job.photos}></print-photos>
          </div>
        </div>
        <div class="detail-notes">
          <markdown-editor
            value=${job.notes ?? ''}
            .saveNotes=${(notes: string) => this.saveNotes(job.job_id, notes)}
          ></markdown-editor>
        </div>
      </div>
    </section>`
  }

  private renderActions(job: PrintJob): TemplateResult {
    return html`<div class="detail-footer">
      <button class="button primary print-again-button" @click=${() => this.startPrint(job.filename ?? '')}>
        ${renderIcon('play', 14)}Print again
      </button>
      <button class="button restore-cost-button" ?disabled=${this.isRestoring} @click=${this.restore}>
        ${renderIcon('refresh', 14)}Restore cost
      </button>
    </div>`
  }

  private renderState(message: string): TemplateResult {
    return html`<div class="state-message">${message}</div>`
  }

  render(): TemplateResult {
    if (this.loadState === 'loading') return this.renderState('Loading print…')
    const job = this.job
    if (this.loadState === 'error' || !job) return this.renderState('Could not load this print')
    return html`<div class="detail-layout">
      <aside class="detail-facts" aria-label="Parameters">
        <div class="detail-facts-body">${this.renderFacts(job)} ${this.renderSlicer(job)}</div>
      </aside>
      ${this.renderMain(job)}
      <aside class="detail-cost" aria-label="Details">
        <div class="section-header detail-cost-title">Cost</div>
        <div class="detail-cost-body">${this.renderCost(job)}</div>
        ${this.renderActions(job)}
      </aside>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'print-detail-page': PrintDetailPage
  }
}
