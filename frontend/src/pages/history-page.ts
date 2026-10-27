import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { assignSpool, getHistory, getProjects, getSpools, linkProjectPrint } from '../api'
import { renderIcon } from '../icons'
import {
  filterPrints,
  formatPrintCost,
  formatPrintDate,
  formatPrintDuration,
  formatPrintFilament,
  sortPrints,
} from '../print-history-list'
import type { PrintFilters, PrintSort } from '../print-history-list'
import { router } from '../router'
import { sseClient } from '../sse'
import type { PrintRecord, Spool } from '../types'
import '../components/print-ready-modal'
import '../styles/history.css'

type LoadState = 'loading' | 'ready' | 'error'
type StopFunction = () => void
type ProjectChoice = { id: number; name: string }
type HistoryPayload = { records: PrintRecord[]; total: number }

const DESKTOP_PAGE_SIZE = 12
const PHONE_PAGE_SIZE = 8
const PHONE_QUERY = '(max-width: 800px)'
const SECTION_CHEVRON_SIZE = 14
const SELECT_CHEVRON_SIZE = 12
const ICON_STROKE_WIDTH = 2.4
const THUMBNAIL_STROKE_WIDTH = 1.6

const SORT_LABELS: Record<PrintSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  'highest-cost': 'Highest cost',
  longest: 'Longest print',
}

const NO_FILTERS: PrintFilters = { fileName: '', spoolId: '', projectId: '', status: '' }

function checkPhoneLayout(): boolean {
  return window.matchMedia?.(PHONE_QUERY).matches ?? false
}

function describeSpoolName(spool: NonNullable<PrintRecord['spool']>): string {
  return `${spool.brand ?? ''} ${spool.material ?? ''}`.trim()
}

function readJobId(record: PrintRecord): string {
  return record.job_id || record.filename
}

/** Every print the printer made: a filtered list in the middle and the selected print on the right. */
@customElement('history-page')
export class HistoryPage extends LitElement {
  @property({ attribute: false }) loadHistory: (limit: number, offset: number) => Promise<HistoryPayload> = getHistory
  @property({ attribute: false }) loadSpools: () => Promise<Spool[]> = getSpools
  @property({ attribute: false }) loadProjects: () => Promise<ProjectChoice[]> = getProjects
  @property({ attribute: false }) assignSpoolToPrint: (jobId: string, spoolId: number) => Promise<unknown> = assignSpool
  @property({ attribute: false }) linkPrintToProject: (projectId: number, jobId: string) => Promise<unknown> = (
    projectId,
    jobId,
  ) => linkProjectPrint(projectId, { job_id: jobId })
  @property({ attribute: false }) startPrint: (filename: string) => void = (filename) =>
    document.querySelector<HTMLElement & { tryPrint(name: string): void }>('print-ready-modal')?.tryPrint(filename)
  @property({ attribute: false }) navigate: (path: string) => void = (path) =>
    router.navigate(path as Parameters<typeof router.navigate>[0])
  @property({ attribute: false }) subscribeToHistoryUpdates: (handler: () => void) => StopFunction = (handler) =>
    sseClient.subscribe((payload) => payload.type === 'history_updated' && handler())
  @property({ attribute: false }) isPhoneLayout: () => boolean = checkPhoneLayout
  @property({ type: Number }) pageSize = this.isPhoneLayout() ? PHONE_PAGE_SIZE : DESKTOP_PAGE_SIZE

  @state() private records: PrintRecord[] = []
  @state() private total = 0
  @state() private spools: Spool[] = []
  @state() private projects: ProjectChoice[] = []
  @state() private loadState: LoadState = 'loading'
  @state() private filters: PrintFilters = NO_FILTERS
  @state() private sort: PrintSort = 'newest'
  @state() private selectedJobId: string | null = null
  @state() private assigningJobId: string | null = null
  @state() private isChoosingProject = false
  @state() private failedThumbnails = new Set<string>()

  private stopListening: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.reloadFromStart()
    void this.loadChoices()
    this.stopListening = this.subscribeToHistoryUpdates(() => void this.reloadLoaded())
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopListening?.()
  }

  private async loadChoices(): Promise<void> {
    try {
      this.spools = await this.loadSpools()
      this.projects = await this.loadProjects()
    } catch {
      this.spools = []
    }
  }

  private async reloadFromStart(): Promise<void> {
    await this.loadRecords(this.pageSize, 0, false)
    this.selectedJobId = this.records[0] ? readJobId(this.records[0]) : null
  }

  private async reloadLoaded(): Promise<void> {
    await this.loadRecords(Math.max(this.records.length, this.pageSize), 0, false)
  }

  private async loadMore(): Promise<void> {
    await this.loadRecords(this.pageSize, this.records.length, true)
  }

  private async loadRecords(limit: number, offset: number, isAppending: boolean): Promise<void> {
    try {
      const history = await this.loadHistory(limit, offset)
      this.records = isAppending ? [...this.records, ...history.records] : history.records
      this.total = history.total
      this.loadState = 'ready'
    } catch {
      this.loadState = 'error'
    }
  }

  private findVisiblePrints(): PrintRecord[] {
    return sortPrints(filterPrints(this.records, this.filters), this.sort)
  }

  private findSelectedPrint(): PrintRecord | null {
    return this.records.find((record) => readJobId(record) === this.selectedJobId) ?? null
  }

  private changeFilter(name: keyof PrintFilters, event: Event): void {
    this.filters = { ...this.filters, [name]: (event.target as HTMLInputElement | HTMLSelectElement).value }
  }

  private resetFilters(): void {
    this.filters = NO_FILTERS
    this.sort = 'newest'
  }

  private selectPrint(record: PrintRecord): void {
    if (this.isPhoneLayout()) {
      this.navigate(`/prints/${encodeURIComponent(readJobId(record))}`)
      return
    }
    this.selectedJobId = readJobId(record)
    this.isChoosingProject = false
  }

  private openSelectedDetails(): void {
    const selected = this.findSelectedPrint()
    if (selected) this.navigate(`/prints/${encodeURIComponent(readJobId(selected))}`)
  }

  private printSelectedAgain(): void {
    const selected = this.findSelectedPrint()
    if (selected) this.startPrint(selected.filename)
  }

  private async assignSpoolChoice(record: PrintRecord, event: Event): Promise<void> {
    const spoolId = Number((event.target as HTMLSelectElement).value)
    this.assigningJobId = null
    if (!spoolId) return
    await this.assignSpoolToPrint(readJobId(record), spoolId)
    await this.reloadLoaded()
  }

  private async linkProjectChoice(record: PrintRecord, event: Event): Promise<void> {
    const projectId = Number((event.target as HTMLSelectElement).value)
    this.isChoosingProject = false
    if (!projectId) return
    await this.linkPrintToProject(projectId, readJobId(record))
    await this.reloadLoaded()
  }

  private listSpoolChoices(): { id: number; name: string }[] {
    const known = new Map<number, string>()
    for (const record of this.records) {
      if (record.spool?.id) known.set(record.spool.id, describeSpoolName(record.spool))
    }
    return [...known].map(([id, name]) => ({ id, name }))
  }

  private listProjectChoices(): ProjectChoice[] {
    const known = new Map<number, string>()
    for (const record of this.records) {
      if (record.project) known.set(record.project.id, record.project.name)
    }
    return [...known].map(([id, name]) => ({ id, name }))
  }

  private renderSectionHeader(title: string): TemplateResult {
    return html`<div class="section-header">
      ${renderIcon('chevron-down', SECTION_CHEVRON_SIZE, ICON_STROKE_WIDTH)}${title}
    </div>`
  }

  private renderSelect(
    label: string,
    shownText: string,
    options: TemplateResult,
    onChange: (event: Event) => void,
  ): TemplateResult {
    return html`<label class="value-field select-field filter-select">
      <span class="select-text">${shownText}</span>
      ${renderIcon('chevron-down', SELECT_CHEVRON_SIZE, ICON_STROKE_WIDTH)}
      <select aria-label=${label} @change=${onChange}>
        ${options}
      </select>
    </label>`
  }

  private renderSpoolFilter(): TemplateResult {
    const choices = this.listSpoolChoices()
    const current = choices.find((choice) => String(choice.id) === this.filters.spoolId)
    const shownText = this.filters.spoolId === 'none' ? 'No spool' : (current?.name ?? 'All spools')
    const options = html`<option value="" ?selected=${this.filters.spoolId === ''}>All spools</option>
      <option value="none" ?selected=${this.filters.spoolId === 'none'}>No spool</option>
      ${choices.map(
        (choice) =>
          html`<option value=${choice.id} ?selected=${String(choice.id) === this.filters.spoolId}>
            ${choice.name}
          </option>`,
      )}`
    return this.renderSelect('Spool', shownText, options, (event) => this.changeFilter('spoolId', event))
  }

  private renderProjectFilter(): TemplateResult {
    const choices = this.listProjectChoices()
    const current = choices.find((choice) => String(choice.id) === this.filters.projectId)
    const shownText = this.filters.projectId === 'none' ? 'No project' : (current?.name ?? 'All projects')
    const options = html`<option value="" ?selected=${this.filters.projectId === ''}>All projects</option>
      <option value="none" ?selected=${this.filters.projectId === 'none'}>No project</option>
      ${choices.map(
        (choice) =>
          html`<option value=${choice.id} ?selected=${String(choice.id) === this.filters.projectId}>
            ${choice.name}
          </option>`,
      )}`
    return this.renderSelect('Project', shownText, options, (event) => this.changeFilter('projectId', event))
  }

  private renderStatusFilter(): TemplateResult {
    const statuses = [...new Set(this.records.map((record) => record.status ?? ''))].filter(Boolean)
    const shownText = this.filters.status === '' ? 'All' : this.filters.status
    const options = html`<option value="" ?selected=${this.filters.status === ''}>All</option>
      ${statuses.map(
        (status) => html`<option value=${status} ?selected=${status === this.filters.status}>${status}</option>`,
      )}`
    return this.renderSelect('Status', shownText, options, (event) => this.changeFilter('status', event))
  }

  private renderSortSelect(): TemplateResult {
    const options = html`${(Object.keys(SORT_LABELS) as PrintSort[]).map(
      (sort) => html`<option value=${sort} ?selected=${sort === this.sort}>${SORT_LABELS[sort]}</option>`,
    )}`
    return this.renderSelect('Sort', SORT_LABELS[this.sort], options, (event) => {
      this.sort = (event.target as HTMLSelectElement).value as PrintSort
    })
  }

  private renderFilterRow(label: string, select: TemplateResult): TemplateResult {
    return html`<div class="parameter-row"><span class="parameter-label">${label}</span>${select}</div>`
  }

  private renderSummaryRow(label: string, key: string, value: number): TemplateResult {
    return html`<div class="parameter-row">
      <span class="parameter-label">${label}</span><span class="value-field" data-summary=${key}>${value}</span>
    </div>`
  }

  private renderSearchField(): TemplateResult {
    return html`<div class="search-field">
      <span class="search-icon">${renderIcon('search', 14)}</span>
      <input
        type="search"
        placeholder="Filter by file name"
        aria-label="Filter by file name"
        .value=${this.filters.fileName}
        @input=${(event: Event) => this.changeFilter('fileName', event)}
      />
    </div>`
  }

  private renderFiltersPanel(): TemplateResult {
    return html`<aside class="history-filters" aria-label="Parameters">
      <div class="history-filters-body">
        <div class="section search-section">
          ${this.renderSectionHeader('Search')}
          <div class="section-body">${this.renderSearchField()}</div>
        </div>
        <div class="section filters-section">
          ${this.renderSectionHeader('Filters')}
          <div class="section-body filter-controls">
            ${this.renderFilterRow('Spool', this.renderSpoolFilter())}
            ${this.renderFilterRow('Project', this.renderProjectFilter())}
            <div class="status-filter-row">${this.renderFilterRow('Status', this.renderStatusFilter())}</div>
            <div class="sort-filter-row">${this.renderFilterRow('Sort', this.renderSortSelect())}</div>
          </div>
        </div>
        <div class="section summary-section">
          ${this.renderSectionHeader('Summary')}
          <div class="section-body">
            ${this.renderSummaryRow('Prints', 'prints', this.total)}
            ${this.renderSummaryRow('Showing', 'showing', this.findVisiblePrints().length)}
          </div>
        </div>
      </div>
      <div class="history-filters-footer">
        <button class="button reset-filters-button" @click=${this.resetFilters}>Reset filters</button>
      </div>
    </aside>`
  }

  private renderThumbnail(record: PrintRecord, size: number): TemplateResult {
    const hasFailed = this.failedThumbnails.has(record.filename)
    const source = `/api/files/thumbnail/from-gcode?filename=${encodeURIComponent(record.filename)}`
    return html`<span class="thumbnail print-thumbnail"
      >${hasFailed
        ? renderIcon('cube', size, THUMBNAIL_STROKE_WIDTH)
        : html`<img
            src=${source}
            alt=""
            loading="lazy"
            @error=${() => (this.failedThumbnails = new Set([...this.failedThumbnails, record.filename]))}
          />`}</span
    >`
  }

  private renderAssignSelect(record: PrintRecord): TemplateResult {
    return html`<select
      class="assign-spool-select"
      aria-label="Pick a spool"
      @click=${(event: Event) => event.stopPropagation()}
      @change=${(event: Event) => this.assignSpoolChoice(record, event)}
      @blur=${() => (this.assigningJobId = null)}
    >
      <option value="">Pick spool…</option>
      ${this.spools.map((spool) => html`<option value=${spool.id}>${spool.brand} ${spool.material}</option>`)}
    </select>`
  }

  private renderSpoolCell(record: PrintRecord): TemplateResult {
    if (this.assigningJobId === readJobId(record)) return this.renderAssignSelect(record)
    if (!record.spool) {
      return html`<button
        class="assign-spool-button"
        @click=${(event: Event) => {
          event.stopPropagation()
          this.assigningJobId = readJobId(record)
        }}
      >
        Assign spool
      </button>`
    }
    return html`<span class="spool-tag"
      ><span class="spool-dot" style="background: ${record.spool.color_hex ?? 'transparent'}"></span
      ><span class="spool-name">${describeSpoolName(record.spool)}</span></span
    >`
  }

  private renderDesktopRow(record: PrintRecord): TemplateResult {
    const isSelected = readJobId(record) === this.selectedJobId
    return html`<div
      class="table-row history-row ${isSelected ? 'selected' : ''}"
      tabindex="0"
      @click=${() => this.selectPrint(record)}
      @keydown=${(event: KeyboardEvent) => event.key === 'Enter' && this.selectPrint(record)}
    >
      <span class="print-file">
        ${this.renderThumbnail(record, 16)}<span class="print-file-name monospace">${record.filename}</span>
      </span>
      <span class="muted">${formatPrintDate(record.time)}</span>
      <span class="monospace print-figure">${formatPrintDuration(record.duration_s)}</span>
      <span class="monospace print-figure">${formatPrintFilament(record.filament_g)}</span>
      <span>${this.renderSpoolCell(record)}</span>
      <span class="monospace print-figure print-total">${formatPrintCost(record.cost_total)}</span>
    </div>`
  }

  private renderPhoneRow(record: PrintRecord): TemplateResult {
    const shortDate = formatPrintDate(record.time).replace(/ \d{4}$/, '')
    return html`<div class="history-row phone-row" tabindex="0" @click=${() => this.selectPrint(record)}>
      ${this.renderThumbnail(record, 22)}
      <span class="phone-row-text">
        <span class="print-file-name monospace">${record.filename}</span>
        <span class="muted phone-row-meta"
          >${shortDate} · ${formatPrintDuration(record.duration_s)} · ${formatPrintFilament(record.filament_g)}</span
        >
        <span class="phone-row-spool">${this.renderSpoolCell(record)}</span>
      </span>
      <span class="monospace phone-row-cost">${formatPrintCost(record.cost_total)}</span>
    </div>`
  }

  private renderRow(record: PrintRecord): TemplateResult {
    return this.isPhoneLayout() ? this.renderPhoneRow(record) : this.renderDesktopRow(record)
  }

  private renderStateMessage(): TemplateResult | null {
    if (this.loadState === 'loading') return html`<div class="state-message">Loading prints…</div>`
    if (this.loadState === 'error') return html`<div class="state-message">Could not load the print history</div>`
    if (this.records.length === 0) return html`<div class="state-message">No prints yet</div>`
    if (this.findVisiblePrints().length === 0) return html`<div class="state-message">No prints match the filters</div>`
    return null
  }

  private renderTable(): TemplateResult {
    return html`<div class="history-table">
      <div class="table-row header history-header">
        <span>File</span><span>Date</span><span>Time</span><span>Filament</span><span>Spool</span
        ><span class="print-total">Total</span>
      </div>
      ${this.renderStateMessage() ??
      html`<div class="history-rows">${this.findVisiblePrints().map((record) => this.renderRow(record))}</div>`}
    </div>`
  }

  private renderFooter(): TemplateResult {
    const hasMore = this.records.length < this.total
    return html`<div class="history-footer">
      <span class="history-footer-count muted">Showing ${this.records.length} of ${this.total}</span>
      ${hasMore ? html`<button class="button load-more-button" @click=${this.loadMore}>Load more</button>` : nothing}
    </div>`
  }

  private renderMain(): TemplateResult {
    return html`<section class="history-main" aria-label="Main">
      <div class="history-title-strip">
        <span class="history-title">Print history</span>
        <span class="history-count monospace muted">${this.total} prints</span>
      </div>
      ${this.renderTable()} ${this.renderFooter()}
    </section>`
  }

  private renderDetailRow(label: string, key: string, content: TemplateResult | string): TemplateResult {
    return html`<div class="parameter-row">
      <span class="parameter-label">${label}</span><span class="detail-value" data-detail=${key}>${content}</span>
    </div>`
  }

  private renderField(label: string, key: string, value: string, unit = '', isAccented = false): TemplateResult {
    const field = html`<span class="value-field ${isAccented ? 'accented' : ''}" data-detail=${key}
      >${value}${unit === '' ? nothing : html`<span class="value-unit">${unit}</span>`}</span
    >`
    return html`<div class="parameter-row"><span class="parameter-label">${label}</span>${field}</div>`
  }

  private renderSelectedSpool(record: PrintRecord): TemplateResult | string {
    if (!record.spool) return '—'
    return html`<span class="spool-tag"
      ><span class="spool-dot" style="background: ${record.spool.color_hex ?? 'transparent'}"></span
      >${describeSpoolName(record.spool)}</span
    >`
  }

  private renderSelectedProject(record: PrintRecord): TemplateResult | string {
    if (!record.project) return '—'
    const project = record.project
    return html`<a
      href="/projects/${project.id}"
      @click=${(event: Event) => {
        event.preventDefault()
        this.navigate(`/projects/${project.id}`)
      }}
      >${project.name}</a
    >`
  }

  private renderJobSection(record: PrintRecord): TemplateResult {
    return html`<div class="section">
      ${this.renderSectionHeader('Job')}
      <div class="section-body">
        ${this.renderField('Duration', 'duration', formatPrintDuration(record.duration_s))}
        ${this.renderField('Filament', 'filament', record.filament_g.toFixed(1), 'g')}
        ${this.renderDetailRow('Spool', 'spool', this.renderSelectedSpool(record))}
        ${this.renderDetailRow('Project', 'project', this.renderSelectedProject(record))}
      </div>
    </div>`
  }

  private renderCostSection(record: PrintRecord): TemplateResult {
    const price = record.avg_eur_per_kwh === null ? '—' : record.avg_eur_per_kwh.toFixed(3)
    const power = record.avg_watts === null ? '—' : String(Math.round(record.avg_watts))
    return html`<div class="section">
      ${this.renderSectionHeader('Cost')}
      <div class="section-body">
        ${this.renderField('Filament', 'filament-cost', formatPrintCost(record.cost_filament))}
        ${this.renderField('Electricity', 'electricity-cost', formatPrintCost(record.cost_electricity))}
        ${this.renderField('Avg power', 'average-power', power, 'W')}
        ${this.renderField('Price', 'price', price, '€/kWh')}
        <div class="parameter-row">
          <span class="parameter-label"><strong>Total</strong></span>
          <span class="value-field accented" data-detail="total">${formatPrintCost(record.cost_total)}</span>
        </div>
      </div>
    </div>`
  }

  private renderProjectChoice(record: PrintRecord): TemplateResult {
    return html`<select
      class="add-to-project-select"
      aria-label="Pick a project"
      @change=${(event: Event) => this.linkProjectChoice(record, event)}
    >
      <option value="">Pick project…</option>
      ${this.projects.map((project) => html`<option value=${project.id}>${project.name}</option>`)}
    </select>`
  }

  private renderDetailsActions(record: PrintRecord): TemplateResult {
    return html`<div class="details-footer">
      <button class="button primary print-again-button" @click=${this.printSelectedAgain}>
        ${renderIcon('play', 14)}Print again
      </button>
      <div class="details-footer-row">
        <button class="button open-details-button" @click=${this.openSelectedDetails}>Open details</button>
        ${this.isChoosingProject
          ? this.renderProjectChoice(record)
          : html`<button class="button add-to-project-button" @click=${() => (this.isChoosingProject = true)}>
              ${renderIcon('plus', 14)}Add to project
            </button>`}
      </div>
    </div>`
  }

  private renderSelectedHeading(record: PrintRecord): TemplateResult {
    return html`<div class="selected-heading">
      ${this.renderThumbnail(record, 30)}
      <span class="selected-heading-text">
        <span class="print-name monospace">${record.filename}</span>
        <span class="muted selected-date">${formatPrintDate(record.time)}</span>
      </span>
    </div>`
  }

  private renderDetails(): TemplateResult {
    const selected = this.findSelectedPrint()
    return html`<aside class="history-details selected-print" aria-label="Details">
      <div class="section-header details-title">Selected print</div>
      <div class="details-body">
        ${selected
          ? html`${this.renderSelectedHeading(selected)} ${this.renderJobSection(selected)}
            ${this.renderCostSection(selected)}`
          : nothing}
      </div>
      ${selected ? this.renderDetailsActions(selected) : nothing}
    </aside>`
  }

  render(): TemplateResult {
    return html`<print-ready-modal></print-ready-modal>
      <div class="history-layout">${this.renderFiltersPanel()} ${this.renderMain()} ${this.renderDetails()}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'history-page': HistoryPage
  }
}
