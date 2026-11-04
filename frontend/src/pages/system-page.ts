import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getSystem, setHiddenSystemRows } from '../api'
import '../components/detection-settings'
import { renderIcon } from '../icons'
import { formatPrintDuration } from '../print-history-list'
import type { FaultRecord, SystemFault, SystemReport, SystemRow, SystemSection } from '../types'
import '../styles/system.css'

type StopFunction = () => void
type LoadState = 'loading' | 'ready' | 'error'

const DETECTION_TAB = 'detection'

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
  @state() private chosenTab = ''

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

  private visibleSections(report: SystemReport): SystemSection[] {
    return findVisibleSections(report.sections, this.hiddenKeys)
  }

  private openTab(sections: SystemSection[]): string {
    const names = [...sections.map((section) => section.key), DETECTION_TAB]
    return names.includes(this.chosenTab) ? this.chosenTab : names[0]
  }

  private renderTab(key: string, title: string, openTab: string): TemplateResult {
    const isSelected = key === openTab
    return html`<button
      class="system-tab ${isSelected ? 'selected' : ''}"
      role="tab"
      aria-selected=${isSelected}
      @click=${() => (this.chosenTab = key)}
    >
      ${title}
    </button>`
  }

  private renderTabs(sections: SystemSection[], openTab: string): TemplateResult {
    return html`<div class="system-tabs" role="tablist" aria-label="System">
      ${sections.map((section) => this.renderTab(section.key, section.title, openTab))}
      ${this.renderTab(DETECTION_TAB, 'Detection', openTab)}
    </div>`
  }

  private renderChosenTab(sections: SystemSection[], openTab: string): TemplateResult {
    if (openTab === DETECTION_TAB) return html`<detection-settings></detection-settings>`
    const section = sections.find((candidate) => candidate.key === openTab)!
    return html`<div class="system-sections">${this.renderSection(section)}</div>`
  }

  private renderReports(report: SystemReport): TemplateResult {
    if (this.isChoosingRows) {
      return html`<div class="system-sections">${report.sections.map((section) => this.renderSection(section))}</div>`
    }
    const sections = this.visibleSections(report)
    const openTab = this.openTab(sections)
    return html`${this.renderTabs(sections, openTab)} ${this.renderChosenTab(sections, openTab)}`
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
    return html`<div class="system-layout">
      ${this.renderStrip(this.report)} ${this.renderFaults(this.report)} ${this.renderReports(this.report)}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'system-page': SystemPage
  }
}
