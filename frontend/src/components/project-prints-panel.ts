import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getHistory, linkProjectPrint, unlinkProjectPrint } from '../api'
import { followNavigationLink } from '../navigation'
import { renderIcon } from '../icons'
import { formatCost, formatDuration } from '../project-list'
import { router } from '../router'
import type { PrintRecord, ProjectFile, ProjectPrint } from '../types'

type NavigateFunction = (path: string) => void

const HISTORY_RECORD_LIMIT = 200

const navigateWithRouter: NavigateFunction = (path) => router.navigate(path as Parameters<typeof router.navigate>[0])

function findBaseName(path: string): string {
  return path.split('/').pop() ?? path
}

function formatShortDate(time: string | null): string {
  if (!time) return '—'
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function describePrint(record: PrintRecord | undefined, duration: number | null, cost: number | null): string {
  return [formatShortDate(record?.time ?? null), formatDuration(duration), formatCost(cost)].join(' · ')
}

/** The prints that belong to a project, and a picker to add prints from the history or remove them. */
@customElement('project-prints-panel')
export class ProjectPrintsPanel extends LitElement {
  @property({ attribute: false }) prints: ProjectPrint[] = []
  @property({ attribute: false }) files: ProjectFile[] = []
  @property({ type: Number }) projectId = 0
  @property({ attribute: false }) loadHistory: () => Promise<PrintRecord[]> = async () =>
    (await getHistory(HISTORY_RECORD_LIMIT, 0)).records
  @property({ attribute: false }) linkPrint: (jobIdentifier: string, fileIdentifier?: number) => Promise<unknown> = (
    jobIdentifier,
    fileIdentifier,
  ) => linkProjectPrint(this.projectId, { job_id: jobIdentifier, project_file_id: fileIdentifier })
  @property({ attribute: false }) unlinkPrint: (jobIdentifier: string) => Promise<unknown> = (jobIdentifier) =>
    unlinkProjectPrint(this.projectId, jobIdentifier)
  @property({ attribute: false }) navigate: NavigateFunction = navigateWithRouter

  @state() private history: PrintRecord[] = []
  @state() private isPickerOpen = false
  @state() private linkedJobIdentifiers = new Set<string>()
  private hasChanged = false

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.loadRecords()
  }

  private async loadRecords(): Promise<void> {
    this.history = await this.loadHistory()
  }

  private findRecord(jobIdentifier: string): PrintRecord | undefined {
    return this.history.find((record) => record.job_id === jobIdentifier)
  }

  private findFileIdentifier(record: PrintRecord): number | undefined {
    return this.files.find((file) => file.type === 'gcode' && file.filename === record.filename)?.id
  }

  private openPicker(): void {
    this.linkedJobIdentifiers = new Set(this.prints.map((print) => print.job_id))
    this.hasChanged = false
    this.isPickerOpen = true
  }

  private closePicker(): void {
    this.isPickerOpen = false
    if (this.hasChanged) this.dispatchEvent(new CustomEvent('prints-changed', { bubbles: true }))
  }

  private closePickerOnBackdrop(click: Event): void {
    if (click.target === click.currentTarget) this.closePicker()
  }

  private async addPrint(record: PrintRecord, jobIdentifier: string): Promise<void> {
    await this.linkPrint(jobIdentifier, this.findFileIdentifier(record))
    this.linkedJobIdentifiers = new Set([...this.linkedJobIdentifiers, jobIdentifier])
  }

  private async removePrint(jobIdentifier: string): Promise<void> {
    await this.unlinkPrint(jobIdentifier)
    this.linkedJobIdentifiers = new Set([...this.linkedJobIdentifiers].filter((linked) => linked !== jobIdentifier))
  }

  private async toggleRecord(record: PrintRecord): Promise<void> {
    const jobIdentifier = record.job_id
    if (!jobIdentifier) return
    this.hasChanged = true
    if (this.linkedJobIdentifiers.has(jobIdentifier)) return this.removePrint(jobIdentifier)
    return this.addPrint(record, jobIdentifier)
  }

  private renderPrintLabels(name: string, details: string): TemplateResult {
    return html`<span class="print-labels">
      <span class="monospace print-name">${name}</span>
      <span class="muted print-details">${details}</span>
    </span>`
  }

  private renderPrint(print: ProjectPrint): TemplateResult {
    const record = this.findRecord(print.job_id)
    const path = `/prints/${encodeURIComponent(print.job_id)}`
    return html`<a
      class="list-item print-row"
      href=${path}
      @click=${(click: MouseEvent) => followNavigationLink(click, path, this.navigate)}
    >
      <span class="thumbnail">${renderIcon('cube', 16)}</span>
      ${this.renderPrintLabels(
        record ? findBaseName(record.filename) : print.job_id,
        describePrint(record, print.duration_s, print.cost_total),
      )}
    </a>`
  }

  private renderPrints(): TemplateResult {
    if (this.prints.length === 0) return html`<div class="muted panel-body">No prints yet</div>`
    return html`${this.prints.map((print) => this.renderPrint(print))}`
  }

  private renderChoice(record: PrintRecord): TemplateResult {
    const isLinked = this.linkedJobIdentifiers.has(record.job_id ?? '')
    return html`<button class="print-choice ${isLinked ? 'linked' : ''}" @click=${() => this.toggleRecord(record)}>
      ${this.renderPrintLabels(
        findBaseName(record.filename),
        describePrint(record, record.duration_s, record.cost_total),
      )}
      <span class="choice-mark">${isLinked ? '✓' : '+'}</span>
    </button>`
  }

  private renderPicker(): TemplateResult | typeof nothing {
    if (!this.isPickerOpen) return nothing
    return html`<div class="modal-backdrop" @click=${this.closePickerOnBackdrop}>
      <div class="panel print-picker" role="dialog" aria-label="Add print from history">
        <div class="section-header">Add print from history</div>
        <div class="print-choices">${this.history.map((record) => this.renderChoice(record))}</div>
        <div class="side-panel-footer">
          <button class="button picker-done-button" @click=${this.closePicker}>Done</button>
        </div>
      </div>
    </div>`
  }

  render(): TemplateResult {
    return html`<aside class="prints-panel" aria-label="Prints in this project">
      <div class="section-header prints-header">Prints in this project</div>
      <div class="prints-list">${this.renderPrints()}</div>
      <div class="side-panel-footer prints-footer">
        <button class="button add-print-button" @click=${this.openPicker}>
          ${renderIcon('plus', 14)}Add print from history
        </button>
      </div>
      ${this.renderPicker()}
    </aside>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'project-prints-panel': ProjectPrintsPanel
  }
}
