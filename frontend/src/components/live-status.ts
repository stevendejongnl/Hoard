import { LitElement, css, html, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { PrinterState, Temps, Power, Spool } from '../types';
import { sseClient } from '../sse';
import { getSpools, getFileMetadata } from '../api';

@customElement('live-status')
export class LiveStatus extends LitElement {
  @state() printerState: PrinterState | null = null;
  @state() temps: Temps | null = null;
  @state() power: Power | null = null;
  @state() activeSpool: Spool | null = null;
  @state() fileEstimatedTime: number | null = null;

  private _unsubscribe: (() => void) | null = null;
  private _lastFilename = '';

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
        this._maybeFetchMeta(payload.data.filename);
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

  private async _maybeFetchMeta(filename: string) {
    if (!filename || filename === this._lastFilename) return;
    this._lastFilename = filename;
    this.fileEstimatedTime = null;
    try {
      const meta = await getFileMetadata(filename);
      this.fileEstimatedTime = (meta as any).estimated_time ?? null;
    } catch {
      // metadata unavailable — fine
    }
  }

  private _fmt(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
    return `${s}s`;
  }

  private _finishTime(): string | null {
    const ps = this.printerState;
    if (!ps || ps.state !== 'printing' || ps.progress <= 0) return null;
    const elapsed = ps.time_remaining;
    const total = elapsed / (ps.progress / 100);
    const remaining = total - elapsed;
    const finish = new Date(Date.now() + remaining * 1000);
    return finish.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  private _ringPath(progress: number) {
    const r = 44;
    const cx = 56;
    const cy = 56;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - Math.min(progress, 100) / 100);
    return { circumference, offset, cx, cy, r };
  }

  render() {
    const ps = this.printerState;
    const isPrinting = ps?.state === 'printing' || ps?.state === 'paused';

    return html`
      <div class="card">
        ${isPrinting && ps ? this._renderPrinting(ps) : this._renderIdle()}
        <div class="temps-row">
          <div class="temp-cell">
            <span class="temp-label">Hotend</span>
            <span class="temp-value">${this.temps?.hotend_actual ?? 0}°
              <span class="temp-target">/ ${this.temps?.hotend_target ?? 0}°</span>
            </span>
          </div>
          <div class="temp-cell">
            <span class="temp-label">Bed</span>
            <span class="temp-value">${this.temps?.bed_actual ?? 0}°
              <span class="temp-target">/ ${this.temps?.bed_target ?? 0}°</span>
            </span>
          </div>
          <div class="temp-cell">
            <span class="temp-label">Watts</span>
            <span class="temp-value watts">${this.power?.watts ?? 0} W</span>
          </div>
          <div class="temp-cell">
            <span class="temp-label">Price</span>
            <span class="temp-value">€${(this.power?.eur_per_kwh ?? 0).toFixed(2)}/kWh</span>
          </div>
        </div>
      </div>
    `;
  }

  private _renderPrinting(ps: PrinterState) {
    const { circumference, offset, cx, cy, r } = this._ringPath(ps.progress);
    const finish = this._finishTime();
    const elapsed = ps.time_remaining;
    const filamentM = ps.filament_used ? (ps.filament_used / 1000).toFixed(2) : null;
    const hasLayers = ps.layer_total && ps.layer_total > 0;
    const stateLabel = ps.state === 'paused' ? 'PAUSED' : 'PRINTING';

    return html`
      <div class="print-header">
        <span class="state-badge ${ps.state}">${stateLabel}</span>
        <span class="filename" title="${ps.filename}">${ps.filename}</span>
        <a class="fluidd-link" href="http://klipper.madebysteven.nl" target="_blank" rel="noopener">fluidd →</a>
      </div>

      <div class="print-body">
        <!-- Progress ring -->
        <div class="ring-wrap">
          ${svg`
            <svg viewBox="0 0 112 112" class="ring-svg">
              <circle cx="${cx}" cy="${cy}" r="${r}" class="ring-bg" />
              <circle cx="${cx}" cy="${cy}" r="${r}" class="ring-fill"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}"
                transform="rotate(-90 ${cx} ${cy})"
              />
              <text x="${cx}" y="${cy + 6}" class="ring-pct">${ps.progress}%</text>
            </svg>
          `}
        </div>

        <!-- Metrics grid -->
        <div class="metrics">
          <div class="metric-row">
            <span class="ml">Speed</span>
            <span class="mv">${ps.speed > 0 ? ps.speed + ' mm/s' : '—'}</span>
            <span class="ml">Elapsed</span>
            <span class="mv">${this._fmt(elapsed)}</span>
          </div>
          <div class="metric-row">
            <span class="ml">Filament</span>
            <span class="mv">${filamentM ? filamentM + ' m' : '—'}</span>
            ${this.fileEstimatedTime ? html`
              <span class="ml">Total est.</span>
              <span class="mv">${this._fmt(this.fileEstimatedTime)}</span>
            ` : html`<span class="ml"></span><span class="mv"></span>`}
          </div>
          <div class="metric-row">
            <span class="ml">Layer</span>
            <span class="mv">${hasLayers ? `${ps.layer} / ${ps.layer_total}` : '—'}</span>
            <span class="ml">Finish</span>
            <span class="mv">${finish ?? '—'}</span>
          </div>
        </div>
      </div>

      <div class="progress-bar">
        <div class="progress-fill" style="width:${Math.min(100, ps.progress)}%"></div>
      </div>
    `;
  }

  private _renderIdle() {
    return html`<div class="idle-body"><span class="idle-label">Printer idle</span></div>`;
  }

  static styles = css`
    :host { display: block; }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius, 8px);
      overflow: hidden;
    }

    /* ── header ── */
    .print-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
    }

    .state-badge {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      padding: 2px 7px;
      border-radius: 3px;
      background: var(--cyan-dim, #22d3ee22);
      color: var(--cyan, #22d3ee);
      flex-shrink: 0;
    }

    .state-badge.paused {
      background: rgba(251,191,36,.12);
      color: #fbbf24;
    }

    .filename {
      flex: 1;
      font-size: 11px;
      color: var(--text, #e0e0e0);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .fluidd-link {
      font-size: 10px;
      color: var(--cyan, #22d3ee);
      text-decoration: none;
      flex-shrink: 0;
    }

    /* ── print body ── */
    .print-body {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 16px 10px;
    }

    /* ring */
    .ring-wrap {
      flex-shrink: 0;
      width: 88px;
      height: 88px;
    }

    .ring-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .ring-bg {
      fill: none;
      stroke: var(--border, #222);
      stroke-width: 8;
    }

    .ring-fill {
      fill: none;
      stroke: var(--cyan, #22d3ee);
      stroke-width: 8;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.6s ease;
    }

    .ring-pct {
      fill: #fff;
      font-size: 14px;
      font-weight: 300;
      text-anchor: middle;
    }

    /* metrics */
    .metrics {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .metric-row {
      display: grid;
      grid-template-columns: 72px 1fr 72px 1fr;
      gap: 4px 8px;
      align-items: baseline;
    }

    .ml {
      font-size: 9px;
      color: var(--text-muted, #555);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .mv {
      font-size: 12px;
      color: var(--text, #e0e0e0);
      font-weight: 300;
    }

    /* progress bar */
    .progress-bar {
      height: 2px;
      background: var(--border, #222);
    }

    .progress-fill {
      height: 100%;
      background: var(--cyan, #22d3ee);
      transition: width 0.5s ease;
    }

    /* temps row */
    .temps-row {
      display: flex;
      border-top: 1px solid var(--border, #222);
    }

    .temp-cell {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 10px 14px;
      border-right: 1px solid var(--border-sub, #1a1a1a);
    }

    .temp-cell:last-child { border-right: none; }

    .temp-label {
      font-size: 9px;
      color: var(--text-muted, #555);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .temp-value {
      font-size: 16px;
      font-weight: 300;
      color: var(--text, #e0e0e0);
    }

    .temp-target {
      font-size: 11px;
      color: var(--text-muted, #555);
    }

    .temp-value.watts { color: var(--cyan, #22d3ee); }

    /* idle */
    .idle-body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
    }

    .idle-label {
      font-size: 18px;
      font-weight: 300;
      color: var(--text-muted, #555);
    }

    /* mobile */
    @media (max-width: 600px) {
      .print-body { flex-direction: column; align-items: stretch; }
      .ring-wrap { width: 72px; height: 72px; align-self: center; }
      .metric-row { grid-template-columns: 64px 1fr 64px 1fr; }
      .temps-row { flex-wrap: wrap; }
      .temp-cell { flex: 1 1 45%; }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'live-status': LiveStatus;
  }
}
