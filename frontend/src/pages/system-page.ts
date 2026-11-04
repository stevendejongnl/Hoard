import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getSystem, setHiddenSystemRows } from '../api'
import '../components/detection-settings'
import { renderIcon } from '../icons'
import { formatPrintDuration } from '../print-history-list'
import type { FaultRecord, SystemFault, SystemReport, SystemRow, SystemSection } from '../types'
import { groupSections } from './system-pages'
import type { SystemPageEntry } from './system-pages'
import '../styles/system.css'

type StopFunction = () => void
type LoadState = 'loading' | 'ready' | 'error'

const FAULTS_PAGE = 'faults'
const DETECTION_PAGE = 'detection'

const REFRESH_MILLISECONDS = 10_000
const MILLISECONDS_PER_SECOND = 1000

function repeatWithInterval(callback: () => void): StopFunction {
  const interval = setInterval(callback, REFRESH_MILLISECONDS)
  return () => clearInterval(interval)
}

function formatFaultTime(seconds: number): string {
  return new Date(seconds * MILLISECONDS_PER_SECOND).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function describeFaultDuration(fault: FaultRecord): string {
  if (fault.cleared_at === null) return 'ongoing'
  return `lasted ${formatPrintDuration(fault.cleared_at - fault.first_seen)}`
}

function removeHiddenRows(section: SystemSection, hidden: string[]): SystemSection {
  return { ...section, rows: section.rows.filter((row) => !hidden.includes(row.key)) }
}

/** The sections and rows that are left once the hidden ones are taken out. */
export function findVisibleSections(sections: SystemSection[], hidden: string[]): SystemSection[] {
  return sections
    .filter((section) => !hidden.includes(section.key))
    .map((section) => removeHiddenRows(section, hidden))
    .filter((section) => section.rows.length > 0)
}

/** What the printer's host and boards report, whatever they are, and what is or was wrong. */
@customElement('system-page')
export class SystemPage extends LitElement {
  @property({ attribute: false }) loadSystem: () => Promise<SystemReport> = getSystem
  @property({ attribute: false }) saveHiddenRows: (keys: string[]) => Promise<unknown> = setHiddenSystemRows
  @property({ attribute: false }) repeatEvery: (callback: () => void) => StopFunction = repeatWithInterval

  @state() private report: SystemReport | null = null
  @state() private loadState: LoadState = 'loading'
  @state() private isChoosingRows = false
  @state() private hiddenKeys: string[] = []
  @state() private isHistoryOpen = false
  @state() private openPageKey: string | null = null

  private stopRefreshing: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.load()
    this.stopRefreshing = this.repeatEvery(() => void this.load())
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopRefreshing?.()
  }

  private async load(): Promise<void> {
    try {
      this.report = await this.loadSystem()
      this.hiddenKeys = this.report.hidden
      this.loadState = 'ready'
    } catch {
      if (!this.report) this.loadState = 'error'
    }
  }

  private async changeHidden(key: string, isShown: boolean): Promise<void> {
    this.hiddenKeys = isShown ? this.hiddenKeys.filter((existing) => existing !== key) : [...this.hiddenKeys, key]
    await this.saveHiddenRows(this.hiddenKeys)
  }

  private renderCheckbox(key: string, className: string, label: string): TemplateResult {
    return html`<input
      type="checkbox"
      class=${className}
      aria-label=${label}
      .checked=${!this.hiddenKeys.includes(key)}
      @change=${(event: Event) => this.changeHidden(key, (event.target as HTMLInputElement).checked)}
    />`
  }

  private renderRow(row: SystemRow): TemplateResult {
    return html`<div class="system-row" data-row=${row.key}>
      ${this.isChoosingRows ? this.renderCheckbox(row.key, 'row-toggle', `Show ${row.label}`) : nothing}
      <span class="parameter-label">${row.label}</span>
      <span class="monospace system-value">${row.value}</span>
    </div>`
  }

  private renderSection(section: SystemSection): TemplateResult {
    return html`<div class="section system-section" data-section=${section.key}>
      <div class="section-header">
        ${this.isChoosingRows
          ? this.renderCheckbox(section.key, 'section-toggle', `Show ${section.title}`)
          : renderIcon('chevron-down', 14, 2.4)}${section.title}
      </div>
      <div class="section-body">${section.rows.map((row) => this.renderRow(row))}</div>
    </div>`
  }

  private renderActiveFault(fault: SystemFault): TemplateResult {
    return html`<div class="active-fault ${fault.severity}">
      <span class="fault-light"></span>
      <span class="fault-text">
        <span class="fault-title">${fault.title}</span>
        ${fault.detail ? html`<span class="monospace muted fault-detail">${fault.detail}</span>` : nothing}
      </span>
      <span class="muted fault-source">${fault.source}</span>
    </div>`
  }

  private renderFaultRecord(fault: FaultRecord): TemplateResult {
    return html`<div class="fault-history-row ${fault.severity}">
      <span class="fault-light"></span>
      <span class="fault-text">
        <span>${fault.title}</span>
        ${fault.detail ? html`<span class="monospace muted fault-detail">${fault.detail}</span>` : nothing}
      </span>
      <span class="muted fault-when">${formatFaultTime(fault.first_seen)} · ${describeFaultDuration(fault)}</span>
    </div>`
  }

  private renderActiveFaults(report: SystemReport): TemplateResult | TemplateResult[] {
    if (report.active_faults.length === 0) return html`<div class="muted no-faults">No active faults</div>`
    return report.active_faults.map((fault) => this.renderActiveFault(fault))
  }

  private renderFaultHistory(report: SystemReport): TemplateResult | typeof nothing {
    if (report.fault_history.length === 0) return nothing
    return html`<button
        class="fault-history-toggle"
        aria-expanded=${this.isHistoryOpen}
        @click=${() => (this.isHistoryOpen = !this.isHistoryOpen)}
      >
        ${renderIcon(this.isHistoryOpen ? 'chevron-down' : 'chevron-right', 14, 2.4)}History
        <span class="monospace">${report.fault_history.length}</span>
      </button>
      ${this.isHistoryOpen ? report.fault_history.map((fault) => this.renderFaultRecord(fault)) : nothing}`
  }

  private renderFaults(report: SystemReport): TemplateResult {
    return html`<section class="section system-faults" aria-label="Faults">
      <div class="section-header">
        ${renderIcon('chevron-down', 14, 2.4)}Faults
        <span class="monospace system-fault-total">${report.active_faults.length}</span>
      </div>
      ${this.renderActiveFaults(report)} ${this.renderFaultHistory(report)}
    </section>`
  }

  private renderListItem(key: string, title: string, openKey: string, count?: number): TemplateResult {
    const isSelected = key === openKey
    return html`<button
      class="system-list-item ${isSelected ? 'selected' : ''}"
      aria-current=${isSelected ? 'page' : nothing}
      @click=${() => (this.openPageKey = key)}
    >
      <span class="system-list-title">${title}</span>
      ${count === undefined ? nothing : html`<span class="monospace system-list-count">${count}</span>`}
      <span class="system-list-chevron">${renderIcon('chevron-right', 14, 2.4)}</span>
    </button>`
  }

  private renderListGroup(heading: string, pages: SystemPageEntry[], openKey: string): TemplateResult {
    const pagesUnderHeading = pages.filter((page) => page.heading === heading)
    return html`<div class="system-list-heading">${heading}</div>
      ${pagesUnderHeading.map((page) => this.renderListItem(page.key, page.title, openKey))}`
  }

  private renderList(report: SystemReport, pages: SystemPageEntry[], openKey: string): TemplateResult {
    const headings = [...new Set(pages.map((page) => page.heading))]
    return html`<nav class="system-list" aria-label="System">
      ${this.renderListItem(FAULTS_PAGE, 'Faults', openKey, report.active_faults.length)}
      ${headings.map((heading) => this.renderListGroup(heading, pages, openKey))}
      <div class="system-list-heading">Settings</div>
      ${this.renderListItem(DETECTION_PAGE, 'Failure detection', openKey)}
    </nav>`
  }

  private renderPageContent(report: SystemReport, pages: SystemPageEntry[], openKey: string): TemplateResult {
    if (openKey === FAULTS_PAGE) return this.renderFaults(report)
    if (openKey === DETECTION_PAGE) return html`<detection-settings></detection-settings>`
    const page = pages.find((candidate) => candidate.key === openKey)!
    return html`<div class="system-sections">${page.sections.map((section) => this.renderSection(section))}</div>`
  }

  private renderPane(report: SystemReport, pages: SystemPageEntry[], openKey: string): TemplateResult {
    return html`<div class="system-pane">
      <button class="system-back" @click=${() => (this.openPageKey = null)}>
        ${renderIcon('chevron-left', 14, 2.4)}System
      </button>
      ${this.renderPageContent(report, pages, openKey)}
    </div>`
  }

  private openKey(pages: SystemPageEntry[]): string {
    const keys = [FAULTS_PAGE, DETECTION_PAGE, ...pages.map((page) => page.key)]
    if (this.openPageKey !== null && keys.includes(this.openPageKey)) return this.openPageKey
    return pages[0]?.key ?? FAULTS_PAGE
  }

  private renderReports(report: SystemReport): TemplateResult {
    if (this.isChoosingRows) {
      return html`<div class="system-sections">${report.sections.map((section) => this.renderSection(section))}</div>`
    }
    const pages = groupSections(findVisibleSections(report.sections, this.hiddenKeys))
    const openKey = this.openKey(pages)
    return html`<div class="system-body" ?data-open=${this.openPageKey !== null}>
      ${this.renderList(report, pages, openKey)} ${this.renderPane(report, pages, openKey)}
    </div>`
  }

  private renderChooseRowsButton(report: SystemReport): TemplateResult | typeof nothing {
    if (report.sections.length === 0) return nothing
    return html`<button
      class="button small choose-rows-button"
      @click=${() => (this.isChoosingRows = !this.isChoosingRows)}
    >
      ${this.isChoosingRows ? 'Done' : 'Choose rows'}
    </button>`
  }

  private renderStrip(report: SystemReport): TemplateResult {
    return html`<div class="system-strip">
      <span class="system-title">System</span>
      ${this.renderChooseRowsButton(report)}
    </div>`
  }

  render(): TemplateResult {
    if (this.loadState === 'loading') return html`<div class="state-message">Loading system…</div>`
    if (!this.report) return html`<div class="state-message">Could not load the system information</div>`
    return html`<div class="system-layout">${this.renderStrip(this.report)} ${this.renderReports(this.report)}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'system-page': SystemPage
  }
}
