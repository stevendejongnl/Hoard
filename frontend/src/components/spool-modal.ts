import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { Spool } from '../types'
import { createSpool, updateSpool } from '../api'

@customElement('spool-modal')
export class SpoolModal extends LitElement {
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
      width: 480px;
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

    .form-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-label {
      font-size: 9px;
      text-transform: uppercase;
      color: var(--text-muted, #555);
      letter-spacing: 0.05em;
    }

    .form-input {
      background: var(--bg-raised, #202020);
      border: 1px solid var(--border, #222);
      border-radius: 4px;
      padding: 8px 12px;
      color: var(--text, #e0e0e0);
      font-size: 12px;
      width: 100%;
      box-sizing: border-box;
      outline: none;
    }

    .form-input:focus {
      border-color: var(--cyan, #22d3ee);
    }

    .form-textarea {
      background: var(--bg-raised, #202020);
      border: 1px solid var(--border, #222);
      border-radius: 4px;
      padding: 8px 12px;
      color: var(--text, #e0e0e0);
      font-size: 12px;
      width: 100%;
      box-sizing: border-box;
      outline: none;
      resize: vertical;
      min-height: 60px;
      font-family: inherit;
    }

    .form-textarea:focus {
      border-color: var(--cyan, #22d3ee);
    }

    .color-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .color-picker {
      width: 36px;
      height: 36px;
      border: 1px solid var(--border, #222);
      border-radius: 4px;
      background: var(--bg-raised, #202020);
      padding: 2px;
      cursor: pointer;
      flex-shrink: 0;
    }

    .color-picker:focus {
      border-color: var(--cyan, #22d3ee);
      outline: none;
    }

    .modal-footer {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      padding: 12px 20px;
      border-top: 1px solid var(--border, #222);
      flex-shrink: 0;
      gap: 8px;
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
  `

  @property({ type: Boolean }) open = false
  @property({ type: Object }) spool: Spool | null = null

  @state() brand = ''
  @state() material = ''
  @state() color = ''
  @state() colorHex = '#ffffff'
  @state() costPerGram = ''
  @state() initialWeightG = ''
  @state() currentWeightG = ''
  @state() notes = ''

  updated(changedProps: Map<string, unknown>) {
    if (changedProps.has('spool')) {
      if (this.spool) {
        this.brand = this.spool.brand ?? ''
        this.material = this.spool.material ?? ''
        this.color = this.spool.color ?? ''
        this.colorHex = this.spool.color_hex ?? '#ffffff'
        this.costPerGram = this.spool.cost_per_gram != null ? String(this.spool.cost_per_gram) : ''
        this.initialWeightG = this.spool.initial_weight_g != null ? String(this.spool.initial_weight_g) : ''
        this.currentWeightG = this.spool.current_weight_g != null ? String(this.spool.current_weight_g) : ''
        this.notes = this.spool.notes ?? ''
      } else {
        this.brand = ''
        this.material = ''
        this.color = ''
        this.colorHex = '#ffffff'
        this.costPerGram = ''
        this.initialWeightG = ''
        this.currentWeightG = ''
        this.notes = ''
      }
    }
  }

  private _close() {
    this.open = false
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }))
  }

  private async _save() {
    const payload: Partial<Spool> = {
      brand: this.brand,
      material: this.material,
      color: this.color,
      color_hex: this.colorHex || null,
      cost_per_gram: this.costPerGram !== '' ? parseFloat(this.costPerGram) : 0,
      initial_weight_g: this.initialWeightG !== '' ? parseFloat(this.initialWeightG) : 0,
      current_weight_g: this.currentWeightG !== '' ? parseFloat(this.currentWeightG) : 0,
      notes: this.notes || null,
    }

    try {
      if (this.spool) {
        await updateSpool(this.spool.id, payload)
      } else {
        await createSpool(payload)
      }
      this.dispatchEvent(new CustomEvent('spool-saved', { bubbles: true, composed: true }))
      this._close()
    } catch (err) {
      console.error('Failed to save spool', err)
    }
  }

  private _onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this._close()
    }
  }

  render() {
    const isEdit = this.spool !== null

    return html`
      <div
        class="overlay ${this.open ? '' : 'hidden'}"
        @click=${this._onOverlayClick}
      >
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">${isEdit ? 'Edit spool' : 'Add spool'}</span>
            <button class="close-btn" @click=${this._close}>×</button>
          </div>

          <div class="form-body">
            <div class="form-row">
              <div class="form-field">
                <label class="form-label">Brand</label>
                <input
                  class="form-input"
                  type="text"
                  .value=${this.brand}
                  @input=${(e: InputEvent) => {
                    this.brand = (e.target as HTMLInputElement).value
                  }}
                  placeholder="e.g. Bambu Lab"
                />
              </div>
              <div class="form-field">
                <label class="form-label">Material</label>
                <input
                  class="form-input"
                  type="text"
                  .value=${this.material}
                  @input=${(e: InputEvent) => {
                    this.material = (e.target as HTMLInputElement).value
                  }}
                  placeholder="e.g. PLA"
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-field">
                <label class="form-label">Color</label>
                <input
                  class="form-input"
                  type="text"
                  .value=${this.color}
                  @input=${(e: InputEvent) => {
                    this.color = (e.target as HTMLInputElement).value
                  }}
                  placeholder="e.g. White"
                />
              </div>
              <div class="form-field">
                <label class="form-label">Color hex</label>
                <div class="color-row">
                  <input
                    class="color-picker"
                    type="color"
                    .value=${this.colorHex}
                    @input=${(e: InputEvent) => {
                      this.colorHex = (e.target as HTMLInputElement).value
                    }}
                  />
                  <input
                    class="form-input"
                    type="text"
                    .value=${this.colorHex}
                    @input=${(e: InputEvent) => {
                      this.colorHex = (e.target as HTMLInputElement).value
                    }}
                    placeholder="#ffffff"
                  />
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-field">
                <label class="form-label">Cost per gram (€/g)</label>
                <input
                  class="form-input"
                  type="number"
                  step="0.001"
                  min="0"
                  .value=${this.costPerGram}
                  @input=${(e: InputEvent) => {
                    this.costPerGram = (e.target as HTMLInputElement).value
                  }}
                  placeholder="0.020"
                />
              </div>
              <div class="form-field">
                <label class="form-label">Initial weight (g)</label>
                <input
                  class="form-input"
                  type="number"
                  step="1"
                  min="0"
                  .value=${this.initialWeightG}
                  @input=${(e: InputEvent) => {
                    this.initialWeightG = (e.target as HTMLInputElement).value
                  }}
                  placeholder="1000"
                />
              </div>
            </div>

            <div class="form-field">
              <label class="form-label">Current weight (g)</label>
              <input
                class="form-input"
                type="number"
                step="1"
                min="0"
                .value=${this.currentWeightG}
                @input=${(e: InputEvent) => {
                  this.currentWeightG = (e.target as HTMLInputElement).value
                }}
                placeholder="850"
              />
            </div>

            <div class="form-field">
              <label class="form-label">Notes</label>
              <textarea
                class="form-textarea"
                .value=${this.notes}
                @input=${(e: InputEvent) => {
                  this.notes = (e.target as HTMLTextAreaElement).value
                }}
                placeholder="Optional notes…"
              ></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-ghost" @click=${this._close}>cancel</button>
            <button class="btn-primary" @click=${this._save}>Save</button>
          </div>
        </div>
      </div>
    `
  }
}
