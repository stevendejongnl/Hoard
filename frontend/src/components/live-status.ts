import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { PrinterState, Temps, Power, Spool } from '../types';
import { sseClient } from '../sse';
import { getSpools } from '../api';

@customElement('live-status')
export class LiveStatus extends LitElement {
  @state() printerState: PrinterState | null = null;
  @state() temps: Temps | null = null;
  @state() power: Power | null = null;
  @state() activeSpool: Spool | null = null;

  private _unsubscribe: (() => void) | null = null;

  async connectedCallback() {
    super.connectedCallback();

    try {
      const spools = await getSpools();
      this.activeSpool = spools.find((s) => s.active === 1) ?? null;
    } catch (e) {
      console.error('[live-status] Failed to load spools:', e);
    }

    this._unsubscribe = sseClient.subscribe((payload) => {
      if (payload.type === 'printer_state') {
        this.printerState = payload.data;
      } else if (payload.type === 'temps') {
        this.temps = payload.data;
      } else if (payload.type === 'power') {
        this.power = payload.data;
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  private _formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  private _computeCost(): number | null {
    if (!this.printerState || this.printerState.state !== 'printing') return null;
    if (!this.power) return null;
    const elapsedH = this.printerState.time_remaining / 3600;
    return elapsedH * (this.power.watts ?? 0) / 1000 * (this.power.eur_per_kwh ?? 0);
  }

  render() {
    const isPrinting = this.printerState?.state === 'printing';
    const cost = this._computeCost();
    const progress = this.printerState?.progress ?? 0;
    const elapsedSec = this.printerState?.time_remaining ?? 0;

    return html`
      <div class="grid">
        <!-- Left: big cost card -->
        <div class="big-cost">
          ${isPrinting ? this._renderPrintingCard(cost, progress, elapsedSec) : this._renderIdleCard()}
        </div>

        <!-- Right: metrics side -->
        <div class="metrics-side">
          <div class="metric-cell">
            <span class="metric-label">Watts</span>
            <span class="metric-value watts">${this.power?.watts ?? 0} W</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">Hotend</span>
            <span class="metric-value">${this.temps?.hotend_actual ?? 0}°C</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">Bed</span>
            <span class="metric-value">${this.temps?.bed_actual ?? 0}°C</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">Price</span>
            <span class="metric-value">€${(this.power?.eur_per_kwh ?? 0).toFixed(2)} / kWh</span>
          </div>
        </div>
      </div>
    `;
  }

  private _renderPrintingCard(
    cost: number | null,
    progress: number,
    elapsedSec: number,
  ) {
    const filename = this.printerState?.filename ?? '—';
    const currentLayer = this.printerState?.layer ?? 0;
    const totalLayers = this.printerState?.layer_total ?? 0;

    return html`
      <span class="cost-label">Estimated electricity cost</span>
      <span class="cost-value">
        ${cost !== null ? `€${cost.toFixed(2)}` : 'calculating...'}
      </span>
      <span class="cost-sub">
        ${progress}% complete &nbsp;·&nbsp; ${this._formatElapsed(elapsedSec)}
      </span>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${Math.min(100, progress)}%"></div>
      </div>
      <div class="file-row">
        <span class="file-name">${filename}</span>
        <span class="file-layers">layer ${currentLayer} / ${totalLayers}</span>
      </div>
      <a class="fluidd-link" href="http://klipper.madebysteven.nl" target="_blank" rel="noopener">
        open in fluidd →
      </a>
    `;
  }

  private _renderIdleCard() {
    return html`<span class="idle-label">Printer idle</span>`;
  }

  static styles = css`
    :host {
      display: block;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius, 8px);
      overflow: hidden;
    }

    /* ── Left: big cost card ── */
    .big-cost {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 24px 28px;
      border-right: 1px solid var(--border);
      min-height: 160px;
    }

    .cost-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .cost-value {
      font-size: 52px;
      font-weight: 200;
      color: #fff;
      letter-spacing: -3px;
      line-height: 1;
      margin-bottom: 8px;
    }

    .cost-sub {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .progress-track {
      height: 1px;
      background: var(--border);
      border-radius: 1px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .progress-fill {
      height: 100%;
      background: var(--cyan);
      transition: width 0.4s ease;
    }

    .file-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: var(--text-dim);
      margin-bottom: 14px;
    }

    .file-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 60%;
    }

    .file-layers {
      flex-shrink: 0;
    }

    .fluidd-link {
      font-size: 10px;
      color: var(--cyan);
      text-decoration: none;
      align-self: flex-start;
    }

    .fluidd-link:hover {
      text-decoration: underline;
    }

    .idle-label {
      font-size: 18px;
      font-weight: 300;
      color: var(--text-muted);
      text-align: center;
      margin: auto;
    }

    /* ── Right: metrics side ── */
    .metrics-side {
      display: flex;
      flex-direction: column;
      min-width: 140px;
    }

    .metric-cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-sub);
    }

    .metric-cell:last-child {
      border-bottom: none;
    }

    .metric-label {
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .metric-value {
      font-size: 20px;
      font-weight: 300;
      color: var(--text);
      line-height: 1;
    }

    .metric-value.watts {
      color: var(--cyan);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'live-status': LiveStatus;
  }
}
