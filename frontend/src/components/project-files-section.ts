import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { addProjectFile, deleteProjectFile, getFiles, uploadProjectStl } from '../api'
import { renderIcon } from '../icons'
import type { ProjectFile } from '../types'

const MODEL_FILE_TYPES = '.stl,.3mf,.scad,.step,.stp,.obj,.f3d,.FCStd'

function findBaseName(path: string): string {
  return path.split('/').pop() ?? path
}

function describeFileKind(file: ProjectFile): string {
  if (file.type === 'gcode') return 'G-code · linked'
  return 'STL'
}

/** The files panel of a project: the G-code linked to it and the model files uploaded to it. */
@customElement('project-files-section')
export class ProjectFilesSection extends LitElement {
  @property({ attribute: false }) files: ProjectFile[] = []
  @property({ type: Number }) projectId = 0
  @property({ attribute: false }) listGcodeFiles: () => Promise<string[]> = async () =>
    (await getFiles()).map((file) => file.filename)
  @property({ attribute: false }) linkGcodeFile: (filename: string) => Promise<ProjectFile> = (filename) =>
    addProjectFile(this.projectId, { type: 'gcode', filename })
  @property({ attribute: false }) uploadStl: (file: File) => Promise<ProjectFile> = (file) =>
    uploadProjectStl(this.projectId, file, file.name)
  @property({ attribute: false }) removeFile: (fileIdentifier: number) => Promise<unknown> = (fileIdentifier) =>
    deleteProjectFile(this.projectId, fileIdentifier)

  @state() private isPickerOpen = false
  @state() private gcodeFilenames: string[] = []

  createRenderRoot() {
    return this
  }

  private reportFiles(files: ProjectFile[]): void {
    this.dispatchEvent(new CustomEvent('files-changed', { detail: files, bubbles: true }))
  }

  private async openPicker(): Promise<void> {
    this.gcodeFilenames = await this.listGcodeFiles()
    this.isPickerOpen = true
  }

  private closePicker(): void {
    this.isPickerOpen = false
  }

  private closePickerOnBackdrop(click: Event): void {
    if (click.target === click.currentTarget) this.closePicker()
  }

  private async linkFile(filename: string): Promise<void> {
    this.closePicker()
    const file = await this.linkGcodeFile(filename)
    this.reportFiles([...this.files, file])
  }

  private async handleUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const chosenFile = input.files?.[0]
    if (!chosenFile) return
    const file = await this.uploadStl(chosenFile)
    input.value = ''
    this.reportFiles([...this.files, file])
  }

  private async removeProjectFile(fileIdentifier: number): Promise<void> {
    await this.removeFile(fileIdentifier)
    this.reportFiles(this.files.filter((file) => file.id !== fileIdentifier))
  }

  private renderFile(file: ProjectFile): TemplateResult {
    return html`<div class="file-row">
      <span class="muted file-icon">${renderIcon('file', 16)}</span>
      <span class="monospace file-name">${file.label ?? findBaseName(file.filename)}</span>
      <span class="muted file-kind">${describeFileKind(file)}</span>
      <button
        class="button flat icon-only small file-remove"
        aria-label="Remove file"
        @click=${() => this.removeProjectFile(file.id)}
      >
        ${renderIcon('trash', 14)}
      </button>
    </div>`
  }

  private renderFiles(): TemplateResult {
    if (this.files.length === 0) return html`<div class="muted">No files yet</div>`
    return html`${this.files.map((file) => this.renderFile(file))}`
  }

  private renderGcodeChoice(filename: string): TemplateResult {
    return html`<button class="gcode-choice monospace" @click=${() => this.linkFile(filename)}>${filename}</button>`
  }

  private renderPickerChoices(): TemplateResult {
    if (this.gcodeFilenames.length === 0) return html`<div class="muted">No G-code files on the printer</div>`
    return html`${this.gcodeFilenames.map((filename) => this.renderGcodeChoice(filename))}`
  }

  private renderPicker(): TemplateResult | typeof nothing {
    if (!this.isPickerOpen) return nothing
    return html`<div class="modal-backdrop" @click=${this.closePickerOnBackdrop}>
      <div class="panel gcode-picker" role="dialog" aria-label="Select a G-code file">
        <div class="section-header">
          Select a G-code file
          <button class="button flat icon-only small" aria-label="Close" @click=${this.closePicker}>
            ${renderIcon('close', 14)}
          </button>
        </div>
        <div class="gcode-choices">${this.renderPickerChoices()}</div>
      </div>
    </div>`
  }

  render(): TemplateResult {
    return html`<section class="panel files-panel" aria-label="Files">
      <div class="section-header panel-header">
        Files
        <span class="panel-actions">
          <label class="button panel-action">
            ${renderIcon('upload', 14)}<span class="long-label">Upload </span>STL
            <input type="file" accept=${MODEL_FILE_TYPES} hidden @change=${this.handleUpload} />
          </label>
          <button class="button panel-action primary" @click=${this.openPicker}>
            ${renderIcon('plus', 14)}<span class="long-label">Link </span>G-code
          </button>
        </span>
      </div>
      <div class="panel-body">${this.renderFiles()}</div>
      ${this.renderPicker()}
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'project-files-section': ProjectFilesSection
  }
}
