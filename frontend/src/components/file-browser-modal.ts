import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getFiles, uploadFile } from '../api'
import { filterFiles, formatFileSize } from '../file-list'
import { renderIcon } from '../icons'
import { formatPrintDuration, formatPrintFilament } from '../print-history-list'
import type { GcodeFile } from '../types'
import '../styles/files.css'

type LoadState = 'loading' | 'ready' | 'error'

const NO_VALUE = '—'

/** A dialog with the files on the printer: search, pick one, or upload a new one. */
@customElement('file-browser-modal')
export class FileBrowserModal extends LitElement {
  @property({ type: Boolean }) open = false
  /** the file that is selected when the dialog opens */
  @property({ type: String }) initialSelection: string | null = null
  @property({ attribute: false }) loadFiles: () => Promise<GcodeFile[]> = getFiles
  @property({ attribute: false }) uploadFile: (file: File) => Promise<unknown> = uploadFile

  @state() private files: GcodeFile[] = []
  @state() private loadState: LoadState = 'loading'
  @state() private searchText = ''
  @state() private selectedName: string | null = null

  createRenderRoot() {
    return this
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('open') && this.open) {
      this.selectedName = this.initialSelection
      void this.reload()
    }
  }

  private async reload(): Promise<void> {
    try {
      this.files = await this.loadFiles()
      this.loadState = 'ready'
    } catch {
      this.loadState = 'error'
    }
  }

  private close(): void {
    this.open = false
    this.searchText = ''
    this.selectedName = null
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }))
  }

  private confirmSelection(): void {
    if (!this.selectedName) return
    this.dispatchEvent(
      new CustomEvent('file-selected', { detail: { filename: this.selectedName }, bubbles: true, composed: true }),
    )
    this.close()
  }

  private async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      await this.uploadFile(file)
      await this.reload()
    } catch {
      this.loadState = 'error'
    }
  }

  private renderRow(file: GcodeFile): TemplateResult {
    const isSelected = file.filename === this.selectedName
    return html`<div
      class="table-row browser-file-row ${isSelected ? 'selected' : ''}"
      tabindex="0"
      @click=${() => (this.selectedName = file.filename)}
      @keydown=${(event: KeyboardEvent) => event.key === 'Enter' && (this.selectedName = file.filename)}
    >
      <span class="browser-browser-file-name-cell"
        ><span class="thumbnail">${renderIcon('cube', 16, 1.6)}</span
        ><span class="monospace browser-file-name">${file.filename}</span></span
      >
      <span class="muted">${formatFileSize(file.size)}</span>
      <span class="monospace browser-file-figure"
        >${file.estimated_time ? formatPrintDuration(file.estimated_time) : NO_VALUE}</span
      >
      <span class="monospace browser-file-figure"
        >${file.filament_weight_total ? formatPrintFilament(file.filament_weight_total) : NO_VALUE}</span
      >
    </div>`
  }

  private renderMessage(): TemplateResult | null {
    if (this.loadState === 'loading') return html`<div class="state-message">Loading files…</div>`
    if (this.loadState === 'error') return html`<div class="state-message">Could not load the files</div>`
    if (this.files.length === 0) return html`<div class="state-message">No files on the printer</div>`
    if (filterFiles(this.files, this.searchText).length === 0) {
      return html`<div class="state-message">No files match the search</div>`
    }
    return null
  }

  private renderTable(): TemplateResult {
    return html`<div class="table-row header browser-file-header">
        <span>File</span><span>Size</span><span>Time</span><span>Filament</span>
      </div>
      ${this.renderMessage() ??
      html`<div class="browser-browser-file-rows">
        ${filterFiles(this.files, this.searchText).map((file) => this.renderRow(file))}
      </div>`}`
  }

  render(): TemplateResult | typeof nothing {
    if (!this.open) return nothing
    return html`<div class="files-overlay" @click=${this.close}>
      <div class="files-dialog" role="dialog" aria-label="Files" @click=${(event: Event) => event.stopPropagation()}>
        <div class="section-header files-title">
          Files
          <span class="actions">
            <label class="button upload-button"
              >Upload<input type="file" accept=".gcode,.g" hidden @change=${this.upload}
            /></label>
          </span>
        </div>
        <div class="files-search-row">
          <input
            class="files-search"
            type="search"
            placeholder="Filter by file name"
            aria-label="Filter by file name"
            .value=${this.searchText}
            @input=${(event: Event) => (this.searchText = (event.target as HTMLInputElement).value)}
          />
        </div>
        <div class="files-table">${this.renderTable()}</div>
        <div class="files-footer">
          <button class="button cancel-button" @click=${this.close}>Cancel</button>
          <button
            class="button primary select-file-button"
            ?disabled=${this.selectedName === null}
            @click=${this.confirmSelection}
          >
            Select
          </button>
        </div>
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'file-browser-modal': FileBrowserModal
  }
}
