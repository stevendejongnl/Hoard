import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { PrintSettings } from '../types'
import { updatePrintJob } from '../api'

type SettingsKey = keyof PrintSettings

const FIELDS: { key: SettingsKey; label: string; placeholder: string }[] = [
  { key: 'layer_height', label: 'Layer height', placeholder: '0.2mm' },
  { key: 'infill', label: 'Infill', placeholder: '15%' },
  { key: 'walls', label: 'Walls', placeholder: '3' },
  { key: 'nozzle', label: 'Nozzle', placeholder: '0.4mm' },
  { key: 'nozzle_temp', label: 'Nozzle temp', placeholder: '215°C' },
  { key: 'bed_temp', label: 'Bed temp', placeholder: '60°C' },
  { key: 'material', label: 'Material', placeholder: 'PLA' },
  { key: 'printer', label: 'Printer', placeholder: 'Bambu X1C' },
]

@customElement('print-settings-editor')
export class PrintSettingsEditor extends LitElement {
  @property({ attribute: false }) settings: PrintSettings | null = null
  @property({ type: String }) jobId: string = ''

  @state() private _editing = false
  @state() private _draft: PrintSettings = {}
  @state() private _saving = false
  @state() private _error = false

  createRenderRoot() {
    return this
  }

  private _startEdit() {
    this._draft = { ...(this.settings ?? {}) }
    this._editing = true
  }

  private _cancel() {
    this._editing = false
    this._draft = {}
  }

  private async _save() {
    if (!this.jobId) return
    this._saving = true
    try {
      await updatePrintJob(this.jobId, { settings: this._draft })
      this.settings = { ...this._draft }
      this._editing = false
    } catch {
      this._error = true
      setTimeout(() => {
        this._error = false
        this.requestUpdate()
      }, 2000)
    } finally {
      this._saving = false
    }
  }

  private _setValue(key: SettingsKey, value: string) {
    this._draft = { ...this._draft, [key]: value || null }
  }

  render() {
    const s = this.settings ?? {}
    return html`
      <div
        style="background: #1a1a1a; border: 1px solid ${this._error
          ? '#ef4444'
          : '#222'}; border-radius: 8px; padding: 16px; transition: border-color 0.2s;"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span style="font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.05em;"
            >Print settings</span
          >
          ${this._editing
            ? html`
                <div style="display: flex; gap: 6px;">
                  <button
                    style="background: transparent; border: 1px solid #22d3ee33; color: #22d3ee; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer;"
                    @click=${this._save}
                    ?disabled=${this._saving}
                  >
                    ${this._saving ? 'saving…' : 'save'}
                  </button>
                  <button
                    style="background: transparent; border: 1px solid #33333388; color: #555; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer;"
                    @click=${this._cancel}
                  >
                    cancel
                  </button>
                </div>
              `
            : html`
                <button
                  style="background: transparent; border: 1px solid #22d3ee33; color: #22d3ee; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer;"
                  @click=${this._startEdit}
                >
                  edit
                </button>
              `}
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
          ${FIELDS.map(({ key, label, placeholder }) => {
            const val = (s[key] ?? '') as string
            const draftVal = (this._draft[key] ?? '') as string
            return html`
              <div
                style="background: #141414; border: 1px solid #222; border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px;"
              >
                <span style="font-size: 10px; color: #555;">${label}</span>
                ${this._editing
                  ? html`
                      <input
                        type="text"
                        .value=${draftVal}
                        placeholder=${placeholder}
                        style="background: transparent; border: none; border-bottom: 1px solid #333; color: #aaa; font-size: 12px; outline: none; padding: 2px 0; width: 100%; font-family: var(--font);"
                        @input=${(e: Event) => this._setValue(key, (e.target as HTMLInputElement).value)}
                      />
                    `
                  : html` <span style="font-size: 12px; color: ${val ? '#aaa' : '#333'};"> ${val || '—'} </span> `}
              </div>
            `
          })}
        </div>
      </div>
    `
  }
}
