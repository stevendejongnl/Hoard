import { LitElement, css, html, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PredictResult, Spool } from '../types';
import { getSpools, predict, startPrint, uploadFile } from '../api';

@customElement('cost-predictor')
export class CostPredictor extends LitElement {
  // External property set by parent (file picker selection)
  @property() set filename(val: string) { if (val) this._filename = val; }
  get filename() { return this._filename; }

  @state() private _filename: string = '';
  @state() spools: Spool[] = [];
  @state() selectedSpoolId: number | null = null;
  @state() quantity: number = 1;
  @state() result: PredictResult | null = null;
  @state() loading = false;
  @state() uploading = false;
  @state() uploadError = '';

  async connectedCallback() {
    super.connectedCallback();
    try {
      const spools = await getSpools();
      this.spools = spools;
      const active = spools.find((s) => s.active === 1);
      this.selectedSpoolId = active ? active.id : (spools[0]?.id ?? null);
    } catch (e) {
      console.error('[cost-predictor] Failed to load spools:', e);
    }
  }

  updated(changedProps: PropertyValues) {
    if ((changedProps.has('filename') || changedProps.has('_filename')) && this._filename) {
      this._runPredict();
    }
  }

  private async _runPredict() {
    if (!this._filename) return;
    this.loading = true;
    try {
      this.result = await predict(this._filename, this.selectedSpoolId, this.quantity);
    } catch (e) {
      console.error('[cost-predictor] Predict failed:', e);
    } finally {
      this.loading = false;
    }
  }

  private _onQuantityInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.quantity = parseInt(input.value, 10);
    const pct = ((this.quantity - 1) / 19) * 100;
    input.style.setProperty('--pct', `${pct}%`);
    this._runPredict();
  }

  private _onSpoolChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.selectedSpoolId = select.value ? parseInt(select.value, 10) : null;
    this._runPredict();
  }

  private _openFileBrowser() {
    this.dispatchEvent(new CustomEvent('open-file-browser', { bubbles: true, composed: true }));
  }

  private _onUploadClick() {
    this.shadowRoot?.querySelector<HTMLInputElement>('.hidden-input')?.click();
  }

  private _onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    (e.currentTarget as HTMLElement).classList.add('drag-over');
  }

  private _onDragLeave(e: DragEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
  }

  private async _onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.name.endsWith('.gcode')) return;
    await this._uploadFile(file);
  }

  private async _onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    await this._uploadFile(file);
  }

  private async _uploadFile(file: File) {
    this.uploading = true;
    this.uploadError = '';
    try {
      await uploadFile(file);
      this._filename = file.name;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.uploadError = msg.includes('abort') ? 'Upload timed out — is Klipper running?' : `Upload failed: ${msg}`
    } finally {
      this.uploading = false;
    }
  }

  private _formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  render() {
    return html`
      <div class="grid">
        <!-- Left: inputs -->
        <div class="predict-left">
          <div class="field">
            <label class="field-label">File</label>
            <div class="file-display" @click=${this._openFileBrowser}>
              ${this._filename || html`<span class="placeholder">No file selected</span>`}
            </div>
          </div>

          <div class="field">
            <label class="field-label">Or upload to Klipper</label>
            <div class="drop-zone ${this.uploading ? 'uploading' : ''}"
              @click=${this._onUploadClick}
              @dragover=${this._onDragOver}
              @dragleave=${this._onDragLeave}
              @drop=${this._onDrop}>
              <span>${this.uploading ? 'Uploading…' : this.uploadError || 'drop .gcode or click to upload'}</span>
              <input
                type="file"
                accept=".gcode"
                class="hidden-input"
                @change=${this._onFileChange}
              />
            </div>
          </div>

          <div class="field">
            <label class="field-label">Spool</label>
            <select class="select" @change=${this._onSpoolChange} .value=${String(this.selectedSpoolId ?? '')}>
              ${this.spools.map((s) => html`
                <option value="${s.id}" ?selected=${s.id === this.selectedSpoolId}>
                  ${s.brand} ${s.material} — €${s.cost_per_gram.toFixed(3)}/g
                </option>
              `)}
            </select>
          </div>

          <div class="field">
            <label class="field-label">
              Quantity
              <span class="quantity-display">×${this.quantity}</span>
            </label>
            <input
              type="range"
              min="1"
              max="20"
              .value=${String(this.quantity)}
              class="slider"
              style="--pct: ${((this.quantity - 1) / 19) * 100}%"
              @input=${this._onQuantityInput}
            />
          </div>
        </div>

        <!-- Right: result -->
        <div class="predict-result">
          ${this.loading
            ? html`<span class="result-empty">Calculating...</span>`
            : this.result
              ? this._renderResult()
              : html`<span class="result-empty">Select a file to estimate cost</span>`
          }
        </div>
      </div>
    `;
  }

  private _renderResult() {
    const r = this.result!;
    const costPerG = r.filament_g > 0 ? r.cost_filament / r.filament_g : 0;
    const totalHours = (r.estimated_time_s * r.quantity) / 3600;

    return html`
      <div class="result-total">€${r.cost_total.toFixed(2)}</div>
      <div class="result-label">estimated total</div>

      <ul class="breakdown">
        <li>
          <span class="bd-label">Filament</span>
          <span class="bd-value">
            ${r.filament_g.toFixed(1)} g × €${costPerG.toFixed(3)} = €${r.cost_filament.toFixed(2)}
          </span>
        </li>
        <li>
          <span class="bd-label">Electricity</span>
          <span class="bd-value">
            ${totalHours.toFixed(1)}h × ${r.avg_watts}W = €${r.cost_electricity.toFixed(2)}
          </span>
        </li>
        <li>
          <span class="bd-label">Print time</span>
          <span class="bd-value">${this._formatDuration(r.estimated_time_s)}</span>
        </li>
        <li>
          <span class="bd-label">Energy price</span>
          <span class="bd-value">€${r.avg_eur_per_kwh.toFixed(3)}/kWh (27h avg)</span>
        </li>
        <li>
          <span class="bd-label">Printer draw</span>
          <span class="bd-value">${r.avg_watts}W (HA sensor)</span>
        </li>
      </ul>

      <button class="print-btn" @click=${() => this._print()}>▶ Print now</button>
    `;
  }

  private async _print() {
    if (!this._filename) return
    const label = this.result && this.result.quantity > 1
      ? `Print ${this.result.quantity}× ${this._filename}?`
      : `Print ${this._filename}?`
    if (!window.confirm(label)) return
    try {
      await startPrint(this._filename)
    } catch (e) {
      window.alert(`Failed to start print: ${e}`)
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    /* ── Left panel ── */
    .predict-left {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .file-display {
      background: var(--bg-raised);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 300;
      color: var(--text);
      cursor: pointer;
      min-height: 34px;
      display: flex;
      align-items: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-display:hover {
      border-color: var(--cyan-border);
    }

    .placeholder {
      color: var(--text-dim);
    }

    .drop-zone {
      border: 1px dashed var(--border);
      border-radius: 4px;
      padding: 12px 10px;
      font-size: 11px;
      color: var(--text-dim);
      text-align: center;
      cursor: pointer;
      position: relative;
      transition: border-color 0.15s;
    }

    .drop-zone.uploading {
      border-color: var(--cyan-border);
      color: var(--cyan);
      cursor: wait;
    }

    .drop-zone.drag-over {
      border-color: var(--cyan);
      background: var(--cyan-dim);
      color: var(--cyan);
    }

    .drop-zone:hover {
      border-color: var(--cyan-border);
      color: var(--text-muted);
    }

    .hidden-input {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      pointer-events: none;
    }

    .select {
      appearance: none;
      background: var(--bg-raised);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 300;
      color: var(--text);
      width: 100%;
      cursor: pointer;
      outline: none;
    }

    .select:focus {
      border-color: var(--cyan-border);
    }

    .quantity-display {
      font-size: 11px;
      color: var(--cyan);
      font-weight: 300;
      text-transform: none;
      letter-spacing: 0;
    }

    .slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 2px;
      border-radius: 1px;
      outline: none;
      cursor: pointer;
      background: linear-gradient(
        to right,
        var(--cyan) 0%,
        var(--cyan) var(--pct, 0%),
        var(--border) var(--pct, 0%),
        var(--border) 100%
      );
    }

    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--cyan);
      cursor: pointer;
      border: none;
    }

    .slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--cyan);
      cursor: pointer;
      border: none;
    }

    /* ── Right: result ── */
    .predict-result {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }

    .result-empty {
      font-size: 12px;
      color: var(--text-dim);
      text-align: center;
    }

    .result-total {
      font-size: 42px;
      font-weight: 200;
      color: #fff;
      letter-spacing: -2px;
      line-height: 1;
      margin-bottom: 4px;
    }

    .result-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      margin-bottom: 20px;
    }

    .breakdown {
      list-style: none;
      margin: 0;
      padding: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .breakdown li {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }

    .bd-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .bd-value {
      font-size: 11px;
      font-weight: 300;
      color: var(--text);
      text-align: right;
    }

    .print-btn {
      margin-top: 14px;
      width: 100%;
      background: var(--cyan-dim);
      border: 1px solid var(--cyan-border);
      border-radius: 4px;
      color: var(--cyan);
      font-size: 11px;
      font-weight: 500;
      padding: 8px 0;
      cursor: pointer;
      letter-spacing: 0.04em;
    }

    .print-btn:hover {
      background: var(--cyan);
      color: #000;
    }

    @media (max-width: 600px) {
      .grid { grid-template-columns: 1fr; }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'cost-predictor': CostPredictor;
  }
}
