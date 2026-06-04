import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { Project, ProjectFile } from '../types'
import {
  addProjectFile, uploadProjectStl, deleteProjectFile,
  linkProjectPrint, unlinkProjectPrint, getFiles,
  getHistory,
} from '../api'
import type { PrintRecord } from '../types'

function _fmtFileStat(f: ProjectFile): string {
  const parts: string[] = []
  if (f.total_cost != null) parts.push(`€${f.total_cost.toFixed(2)}`)
  if (f.total_duration_s != null) {
    const h = Math.round(f.total_duration_s / 3600)
    parts.push(h < 1 ? '<1h' : `${h}h`)
  }
  return parts.join(' · ')
}

@customElement('project-files-section')
export class ProjectFilesSection extends LitElement {
  @property({ type: Object }) project!: Project

  @state() private _gcodeModal = false
  @state() private _gcodeFiles: string[] = []
  @state() private _linkModal: ProjectFile | null = null
  @state() private _history: PrintRecord[] = []
  @state() private _historyLoading = false
  @state() private _linkedJobIds: Set<string> = new Set()

  createRenderRoot() { return this }

  private _emitUpdated(project: Project) {
    this.dispatchEvent(new CustomEvent('project-updated', { detail: project, bubbles: true }))
  }

  private async _openGcodePicker() {
    const files = await getFiles()
    this._gcodeFiles = files.map(f => f.filename)
    this._gcodeModal = true
  }

  private async _addGcode(filename: string) {
    this._gcodeModal = false
    const pf = await addProjectFile(this.project.id, { type: 'gcode', filename })
    this._emitUpdated({
      ...this.project,
      files: [...(this.project.files ?? []), { ...pf, print_count: 0, total_duration_s: null, total_cost: null, total_filament_g: null }],
    })
  }

  private async _uploadStl(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const pf = await uploadProjectStl(this.project.id, file, file.name)
    this._emitUpdated({
      ...this.project,
      files: [...(this.project.files ?? []), { ...pf, print_count: 0, total_duration_s: null, total_cost: null, total_filament_g: null }],
    })
    input.value = ''
  }

  private async _removeFile(fileId: number) {
    await deleteProjectFile(this.project.id, fileId)
    this._emitUpdated({
      ...this.project,
      files: (this.project.files ?? []).filter(f => f.id !== fileId),
    })
  }

  private async _openLinkPrints(file: ProjectFile) {
    this._linkModal = file
    this._historyLoading = true
    this._linkedJobIds = new Set((this.project.prints ?? []).map(p => p.job_id))
    const result = await getHistory(200, 0)
    this._history = result.records
    this._historyLoading = false
  }

  private async _togglePrint(jobId: string, fileId: number) {
    if (this._linkedJobIds.has(jobId)) {
      await unlinkProjectPrint(this.project.id, jobId)
      this._linkedJobIds = new Set([...this._linkedJobIds].filter(id => id !== jobId))
    } else {
      await linkProjectPrint(this.project.id, { job_id: jobId, project_file_id: fileId })
      this._linkedJobIds = new Set([...this._linkedJobIds, jobId])
    }
  }

  private _closeLinkModal() {
    this._linkModal = null
    // Reload project to get updated stats
    this.dispatchEvent(new CustomEvent('reload-project', { bubbles: true }))
  }

  render() {
    const files = this.project.files ?? []
    return html`
      <div style="background: #1a1a1a; border: 1px solid #222; border-radius: 8px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span style="font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.05em;">Files</span>
          <div style="display: flex; gap: 6px;">
            <label style="background: transparent; border: 1px solid #333; color: #888; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer; min-height: 28px; display: flex; align-items: center;">
              ↑ upload stl
              <input type="file" accept=".stl" style="display: none;" @change=${this._uploadStl}>
            </label>
            <button
              style="background: transparent; border: 1px solid #22d3ee33; color: #22d3ee; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer;"
              @click=${this._openGcodePicker}
            >+ link gcode</button>
          </div>
        </div>

        ${files.length === 0
          ? html`<div style="font-size: 11px; color: #333; padding: 6px 0;">No files yet.</div>`
          : files.map(f => html`
            <div style="display: flex; align-items: center; gap: 10px; background: #141414; border-radius: 5px; padding: 8px 12px; margin-bottom: 5px;">
              <span style="font-size: 9px; background: ${f.type === 'gcode' ? '#22d3ee14' : '#1a1a1a'}; color: ${f.type === 'gcode' ? '#22d3ee' : '#888'}; border: 1px solid ${f.type === 'gcode' ? '#22d3ee28' : '#333'}; border-radius: 3px; padding: 1px 5px; flex-shrink: 0;">${f.type}</span>
              <span style="font-size: 11px; color: #ccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">${f.label ?? f.filename.split('/').pop()}</span>
              ${f.type === 'gcode' ? html`
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 1px; margin-right: 4px; flex-shrink: 0;">
                  <span style="font-size: 11px; color: ${(f.print_count ?? 0) > 0 ? '#22d3ee' : '#555'}; font-weight: 600;">×${f.print_count ?? 0}</span>
                  ${_fmtFileStat(f) ? html`<span style="font-size: 9px; color: #555;">${_fmtFileStat(f)}</span>` : ''}
                </div>
                <button
                  style="background: transparent; border: 1px solid #333; color: #888; border-radius: 3px; padding: 2px 8px; font-size: 9px; cursor: pointer; white-space: nowrap; flex-shrink: 0;"
                  @click=${() => this._openLinkPrints(f)}
                >link prints</button>
              ` : html`
                <a href=${`/api/projects/${this.project.id}/files/${f.id}/download`} style="font-size: 10px; color: #22d3ee; margin-right: 8px; flex-shrink: 0; text-decoration: none;">↓ download</a>
              `}
              <span
                style="font-size: 10px; color: #333; cursor: pointer; padding: 2px 6px; flex-shrink: 0;"
                @click=${() => this._removeFile(f.id)}
              >✕</span>
            </div>
          `)}

        ${this._gcodeModal ? html`
          <div
            style="position: fixed; inset: 0; background: #00000088; display: flex; align-items: center; justify-content: center; z-index: 100;"
            @click=${(e: Event) => { if (e.target === e.currentTarget) this._gcodeModal = false }}
          >
            <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 20px; width: 420px; max-height: 60vh; display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: 600; color: #e0e0e0;">Select gcode file</span>
                <span style="cursor: pointer; color: #555; font-size: 16px;" @click=${() => { this._gcodeModal = false }}>✕</span>
              </div>
              <div style="overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
                ${this._gcodeFiles.length === 0
                  ? html`<div style="color: #555; font-size: 11px; padding: 8px 0;">No gcode files found on printer.</div>`
                  : this._gcodeFiles.map(fname => html`
                    <div
                      style="padding: 8px 10px; background: #141414; border-radius: 4px; cursor: pointer; font-size: 11px; color: #ccc;"
                      @click=${() => this._addGcode(fname)}
                    >${fname}</div>
                  `)}
              </div>
            </div>
          </div>
        ` : ''}

        ${this._linkModal ? html`
          <div
            style="position: fixed; inset: 0; background: #00000088; display: flex; align-items: center; justify-content: center; z-index: 100;"
            @click=${(e: Event) => { if (e.target === e.currentTarget) this._closeLinkModal() }}
          >
            <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 20px; width: 500px; max-height: 70vh; display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: 600; color: #e0e0e0;">Link prints — ${this._linkModal.label ?? this._linkModal.filename.split('/').pop()}</span>
                <span style="cursor: pointer; color: #555; font-size: 16px;" @click=${this._closeLinkModal}>✕</span>
              </div>
              <div style="font-size: 10px; color: #555;">Click to toggle. Changes save immediately.</div>
              <div style="overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
                ${this._historyLoading
                  ? html`<div style="color: #555; font-size: 11px; padding: 8px;">Loading history...</div>`
                  : this._history
                      .filter(r => this._linkModal!.type !== 'gcode' || r.filename === this._linkModal!.filename)
                      .map(r => {
                        const linked = this._linkedJobIds.has(r.job_id ?? '')
                        return html`
                          <div
                            style="padding: 8px 10px; background: ${linked ? '#22d3ee14' : '#141414'}; border: 1px solid ${linked ? '#22d3ee33' : '#222'}; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;"
                            @click=${() => this._togglePrint(r.job_id ?? '', this._linkModal!.id)}
                          >
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                              <span style="font-size: 11px; color: #ccc;">${r.filename}</span>
                              <span style="font-size: 9px; color: #555;">${r.time ? new Date(r.time).toLocaleDateString('nl-NL') : '—'} · ${r.filament_g?.toFixed(1)}g${r.cost_total != null ? ` · €${r.cost_total.toFixed(2)}` : ''}</span>
                            </div>
                            <span style="font-size: 10px; color: ${linked ? '#22d3ee' : '#333'};">${linked ? '✓' : '+'}</span>
                          </div>
                        `
                      })}
              </div>
              <button
                style="background: transparent; border: 1px solid #22d3ee33; color: #22d3ee; border-radius: 6px; padding: 8px; font-size: 12px; cursor: pointer;"
                @click=${this._closeLinkModal}
              >Done</button>
            </div>
          </div>
        ` : ''}
      </div>
    `
  }
}
