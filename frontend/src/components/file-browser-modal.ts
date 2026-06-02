import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GcodeFile } from '../types'
import { getFiles, uploadFile } from '../api'

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${Math.round(bytes / 1024)} KB`
}

@customElement('file-browser-modal')
export class FileBrowserModal extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      backdrop-filter: blur(2px);
    }

    .overlay.hidden {
      display: none;
    }

    .modal {
      background: var(--bg-modal, #161616);
      border: 1px solid var(--border, #222);
      border-radius: 10px;
      width: 620px;
      max-height: 75vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--border, #222);
      flex-shrink: 0;
    }

    .modal-title {
      font-size: 12px;
      font-weight: 300;
      color: #fff;
      margin: 0;
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted, #555);
      font-size: 16px;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
    }

    .close-btn:hover {
      color: var(--text, #e0e0e0);
    }

    .search-bar {
      padding: 12px 20px;
      flex-shrink: 0;
      border-bottom: 1px solid var(--border, #222);
    }

    .search-input {
      width: 100%;
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border, #222);
      border-radius: 4px;
      padding: 8px 12px;
      color: var(--text, #e0e0e0);
      font-size: 11px;
      box-sizing: border-box;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--cyan, #22d3ee);
    }

    .file-list {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    .loading {
      padding: 24px 20px;
      color: var(--text-muted, #555);
      font-size: 11px;
      text-align: center;
    }

    .file-item {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 16px;
      align-items: center;
      padding: 11px 20px;
      border-bottom: 1px solid var(--border-sub, #1a1a1a);
      cursor: pointer;
    }

    .file-item:hover {
      background: var(--bg-surface, #1a1a1a);
    }

    .file-item.selected {
      background: var(--cyan-dim, #22d3ee14);
    }

    .file-name {
      font-size: 11px;
      color: var(--text, #e0e0e0);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-sub {
      font-size: 10px;
      color: var(--text-muted, #555);
      margin-top: 2px;
    }

    .file-size {
      font-size: 10px;
      color: var(--text-muted, #555);
      white-space: nowrap;
    }

    .file-date {
      font-size: 10px;
      color: var(--text-muted, #555);
      white-space: nowrap;
    }

    .modal-footer {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      border-top: 1px solid var(--border, #222);
      flex-shrink: 0;
      gap: 8px;
    }

    .footer-left {
      font-size: 10px;
      color: var(--text-muted, #555);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .footer-right {
      display: flex;
      flex-direction: row;
      gap: 8px;
      flex-shrink: 0;
    }

    .btn-ghost {
      background: none;
      border: 1px solid var(--border, #222);
      border-radius: 4px;
      color: var(--text-muted, #555);
      font-size: 11px;
      padding: 6px 12px;
      cursor: pointer;
    }

    .btn-ghost:hover {
      color: var(--text, #e0e0e0);
      border-color: var(--text-dim, #333);
    }

    .btn-ghost-dashed {
      background: none;
      border: 1px dashed var(--border, #222);
      border-radius: 4px;
      color: var(--text-muted, #555);
      font-size: 11px;
      padding: 6px 12px;
      cursor: pointer;
    }

    .btn-ghost-dashed:hover {
      color: var(--text, #e0e0e0);
      border-color: var(--text-dim, #333);
    }

    .btn-primary {
      background: var(--cyan, #22d3ee);
      border: none;
      border-radius: 4px;
      color: #000;
      font-size: 11px;
      font-weight: 500;
      padding: 6px 14px;
      cursor: pointer;
    }

    .btn-primary:hover {
      opacity: 0.9;
    }

    .btn-primary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    input[type='file'] {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      pointer-events: none;
    }
  `

  @property({ type: Boolean }) open = false
  @state() files: GcodeFile[] = []
  @state() search = ''
  @state() selected: string | null = null
  @state() loading = true

  connectedCallback() {
    super.connectedCallback()
    this._loadFiles()
  }

  updated(changedProps: Map<string, unknown>) {
    if (changedProps.has('open') && this.open) {
      this.search = ''
      this.selected = null
    }
  }

  private async _loadFiles() {
    this.loading = true
    try {
      this.files = await getFiles()
    } finally {
      this.loading = false
    }
  }

  private get _filteredFiles(): GcodeFile[] {
    const q = this.search.toLowerCase()
    return this.files.filter(f => f.filename?.toLowerCase().includes(q))
  }

  private _close() {
    this.open = false
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }))
  }

  private _confirm() {
    if (!this.selected) return
    this.dispatchEvent(
      new CustomEvent('file-selected', {
        detail: { filename: this.selected },
        bubbles: true,
        composed: true,
      })
    )
    this._close()
  }

  private async _onUpload(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      await uploadFile(file)
      await this._loadFiles()
    } catch (err) {
      console.error('Upload failed', err)
    }
    input.value = ''
  }

  private _onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this._close()
    }
  }

  private _triggerUpload() {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>('input[type="file"]')
    input?.click()
  }

  render() {
    const filtered = this._filteredFiles

    return html`
      <div
        class="overlay ${this.open ? '' : 'hidden'}"
        @click=${this._onOverlayClick}
      >
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Klipper files</span>
            <button class="close-btn" @click=${this._close}>×</button>
          </div>

          <div class="search-bar">
            <input
              class="search-input"
              type="text"
              placeholder="Search files…"
              .value=${this.search}
              @input=${(e: InputEvent) => {
                this.search = (e.target as HTMLInputElement).value
              }}
            />
          </div>

          <div class="file-list">
            ${this.loading
              ? html`<div class="loading">Loading…</div>`
              : filtered.map(
                  f => html`
                    <div
                      class="file-item ${this.selected === f.filename ? 'selected' : ''}"
                      @click=${() => {
                        this.selected = f.filename
                      }}
                    >
                      <div>
                        <div class="file-name">${f.filename}</div>
                        <div class="file-sub">
                          ${f.filament_weight_total
                            ? f.filament_weight_total.toFixed(1) + ' g'
                            : ''}
                          ${f.estimated_time ? fmtDuration(f.estimated_time) : ''}
                        </div>
                      </div>
                      <div class="file-size">${fmtSize(f.size)}</div>
                      <div class="file-date">
                        ${new Date(f.modified * 1000).toLocaleDateString('nl-NL', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </div>
                    </div>
                  `
                )}
          </div>

          <div class="modal-footer">
            <div class="footer-left">
              ${this.selected ? this.selected : 'No file selected'}
            </div>
            <div class="footer-right">
              <input type="file" accept=".gcode" @change=${this._onUpload} />
              <button class="btn-ghost-dashed" @click=${this._triggerUpload}>↑ upload new</button>
              <button class="btn-ghost" @click=${this._close}>cancel</button>
              <button
                class="btn-primary"
                ?disabled=${!this.selected}
                @click=${this._confirm}
              >
                select
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  }
}
