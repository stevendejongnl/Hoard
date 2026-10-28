import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getHistory, getSpools } from '../api'
import { renderIcon } from '../icons'
import { formatPrintCost, formatPrintDuration, formatPrintFilament, formatShortPrintDate } from '../print-history-list'
import { router } from '../router'
import { buildSpoolName } from '../spool-list'
import type { PrintRecord, PrinterState, Spool } from '../types'

type ListTab = 'recent' | 'spools'
type LoadState = 'loading' | 'ready' | 'error'
type HistoryPayload = { records: PrintRecord[]; total: number }

const RECENT_PRINT_COUNT = 4
const THUMBNAIL_ICON_SIZE = 18
const THUMBNAIL_STROKE_WIDTH = 1.6
const PLAY_ICON_SIZE = 14

function readJobId(record: PrintRecord): string {
  return record.job_id || record.filename
}

/** The right panel of the dashboard: the latest prints and the spools, in two tabs. */
@customElement('dashboard-lists-panel')
export class DashboardListsPanel extends LitElement {
  @property({ attribute: false }) printerState: PrinterState | null = null
  /** the weight of the filament the running print needs, when its file says so */
  @property({ attribute: false }) currentPrintWeightGrams: number | null = null
  @property({ attribute: false }) loadHistory: (limit: number, offset: number) => Promise<HistoryPayload> = getHistory
  @property({ attribute: false }) loadSpools: () => Promise<Spool[]> = getSpools
  @property({ attribute: false }) startPrint: (filename: string) => void = (filename) =>
    document.querySelector<HTMLElement & { tryPrint(name: string): void }>('print-ready-modal')?.tryPrint(filename)
  @property({ attribute: false }) navigate: (path: string) => void = (path) =>
    router.navigate(path as Parameters<typeof router.navigate>[0])

  @state() private tab: ListTab = 'recent'
  @state() private records: PrintRecord[] = []
  @state() private spools: Spool[] = []
  @state() private recordsState: LoadState = 'loading'
  @state() private spoolsState: LoadState = 'loading'

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.loadLists()
  }

  private async loadLists(): Promise<void> {
    await Promise.all([this.loadRecords(), this.loadSpoolList()])
  }

  private async loadRecords(): Promise<void> {
    try {
      this.records = (await this.loadHistory(RECENT_PRINT_COUNT, 0)).records
      this.recordsState = 'ready'
    } catch {
      this.recordsState = 'error'
    }
  }

  private async loadSpoolList(): Promise<void> {
    try {
      this.spools = await this.loadSpools()
      this.spoolsState = 'ready'
    } catch {
      this.spoolsState = 'error'
    }
  }

  private isPrintActive(): boolean {
    return this.printerState?.state === 'printing' || this.printerState?.state === 'paused'
  }

  private renderThumbnail(): TemplateResult {
    return html`<span class="thumbnail">${renderIcon('cube', THUMBNAIL_ICON_SIZE, THUMBNAIL_STROKE_WIDTH)}</span>`
  }

  private renderListText(title: string, detail: string): TemplateResult {
    return html`<span class="list-item-text"
      ><span class="list-item-title monospace">${title}</span
      ><span class="muted list-item-detail">${detail}</span></span
    >`
  }

  private renderCurrentPrint(): TemplateResult | string {
    if (!this.isPrintActive() || !this.printerState) return ''
    const weight =
      this.currentPrintWeightGrams === null ? '' : ` · ${formatPrintFilament(this.currentPrintWeightGrams)}`
    return html`<div class="list-item selected">
      ${this.renderThumbnail()} ${this.renderListText(this.printerState.filename, `Printing now${weight}`)}
    </div>`
  }

  private renderRecord(record: PrintRecord): TemplateResult {
    const detail = [
      formatShortPrintDate(record.time),
      formatPrintDuration(record.duration_s),
      formatPrintCost(record.cost_total),
    ].join(' · ')
    return html`<div
      class="list-item"
      @click=${() => this.navigate(`/prints/${encodeURIComponent(readJobId(record))}`)}
    >
      ${this.renderThumbnail()} ${this.renderListText(record.filename, detail)}
      <button
        class="button icon-only print-again-icon"
        aria-label="Print again"
        @click=${(event: Event) => {
          event.stopPropagation()
          this.startPrint(record.filename)
        }}
      >
        ${renderIcon('play', PLAY_ICON_SIZE)}
      </button>
    </div>`
  }

  private openFileBrowser(): void {
    this.dispatchEvent(new CustomEvent('open-file-browser', { detail: { purpose: 'print' }, bubbles: true }))
  }

  private renderListMessage(message: string): TemplateResult {
    return html`<div class="list-message">${message}</div>`
  }

  private renderPrintAction(message: string): TemplateResult {
    return html`${this.renderListMessage(message)}
      <div class="list-message-action">
        <button class="button print-a-file-button" @click=${this.openFileBrowser}>Print a file…</button>
      </div>`
  }

  private renderRecentPrints(): TemplateResult {
    const hasPrints = this.isPrintActive() || this.records.length > 0
    if (!hasPrints && this.recordsState === 'loading') return this.renderListMessage('Loading prints…')
    if (!hasPrints && this.recordsState === 'error') return this.renderPrintAction('Could not load the prints')
    if (!hasPrints) return this.renderPrintAction('No prints to show')
    return html`${this.renderCurrentPrint()}${this.records.map((record) => this.renderRecord(record))}`
  }

  private renderSpool(spool: Spool): TemplateResult {
    return html`<div class="list-item">
      <span class="spool-swatch-large" style="background: ${spool.color_hex ?? 'transparent'}"></span>
      ${this.renderListText(buildSpoolName(spool), `${spool.current_weight_g} g left`)}
      ${spool.active ? html`<span class="in-use-tag">IN USE</span>` : ''}
    </div>`
  }

  private renderSpools(): TemplateResult | TemplateResult[] {
    if (this.spoolsState === 'loading') return this.renderListMessage('Loading spools…')
    if (this.spoolsState === 'error') return this.renderListMessage('Could not load the spools')
    if (this.spools.length === 0) return this.renderListMessage('No spools yet')
    return this.spools.map((spool) => this.renderSpool(spool))
  }

  private renderTab(tab: ListTab, label: string): TemplateResult {
    const isSelected = this.tab === tab
    return html`<button
      class="list-tab ${isSelected ? 'selected' : ''}"
      role="tab"
      aria-selected=${isSelected ? 'true' : 'false'}
      @click=${() => (this.tab = tab)}
    >
      ${label}
    </button>`
  }

  render(): TemplateResult {
    return html`<div class="list-tabs" role="tablist" aria-label="Lists">
        ${this.renderTab('recent', 'Recent prints')} ${this.renderTab('spools', 'Spools')}
      </div>
      <div class="list-body">${this.tab === 'recent' ? this.renderRecentPrints() : this.renderSpools()}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dashboard-lists-panel': DashboardListsPanel
  }
}
