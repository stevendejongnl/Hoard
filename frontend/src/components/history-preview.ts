import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { PrintRecord, Spool } from '../types';
import { assignSpool, getHistory, getSpools, startPrint } from '../api';
import { sseClient } from '../sse';
import './spool-modal';
import './cost-breakdown-popup';

declare const window: Window & { router: { navigate: (path: string) => void } };

@customElement('history-preview')
export class HistoryPreview extends LitElement {
  @state() records: PrintRecord[] = [];
  @state() loading = true;
  @state() private _assigningJobId: string | null = null;
  @state() private _spools: Spool[] = [];
  @state() private _spoolModalOpen = false;
  private _pendingJobId: string | null = null;
  private _unsubscribe: (() => void) | null = null;

  private _total = 0;

  async connectedCallback() {
    super.connectedCallback();
    await this._load();
    this._unsubscribe = sseClient.subscribe((payload) => {
      if (payload.type === 'history_updated') {
        this._load();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  private async _load() {
    try {
      const [data, spools] = await Promise.all([getHistory(3, 0), getSpools()]);
      this.records = data.records;
      this._total = data.total;
      this._spools = spools;
    } catch (e) {
      console.error('[history-preview] Failed to load history:', e);
    } finally {
      this.loading = false;
    }
  }

  private async _print(filename: string) {
    if (!window.confirm(`Print ${filename}?`)) return
    try {
      await startPrint(filename)
    } catch (e) {
      window.alert(`Failed to start print: ${e}`)
    }
  }

  private async _onSpoolSelect(jobId: string, e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    if (!val) return;
    if (val === '__new__') {
      this._pendingJobId = jobId;
      this._spoolModalOpen = true;
      (e.target as HTMLSelectElement).value = '';
      return;
    }
    try {
      await assignSpool(jobId, parseInt(val));
      const [data, spools] = await Promise.all([getHistory(3, 0), getSpools()]);
      this.records = data.records;
      this._spools = spools;
    } catch (err) {
      console.error('assign failed', err);
    }
    this._assigningJobId = null;
  }

  private async _onSpoolSaved() {
    this._spoolModalOpen = false;
    // Reload spools, then auto-assign the newly created one (last in list)
    this._spools = await getSpools();
    const newest = this._spools[this._spools.length - 1];
    if (newest && this._pendingJobId) {
      try {
        await assignSpool(this._pendingJobId, newest.id);
        const data = await getHistory(3, 0);
        this.records = data.records;
      } catch (err) {
        console.error('auto-assign failed', err);
      }
    }
    this._pendingJobId = null;
    this._assigningJobId = null;
  }

  private _formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  private _formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  }

  render() {
    if (this.loading) {
      return html`<span class="loading">Loading...</span>`;
    }

    return html`
      <spool-modal
        .open=${this._spoolModalOpen}
        .spool=${null}
        @spool-saved=${this._onSpoolSaved}
        @close=${() => { this._spoolModalOpen = false; this._assigningJobId = null; }}
      ></spool-modal>

      <div class="header">
        <span class="header-label">Recent prints</span>
        <a class="header-link" @click=${() => window.router.navigate('/history')}>view all →</a>
      </div>

      <table>
        <thead>
          <tr>
            <th class="th-thumb"></th>
            <th>File</th>
            <th>Duration</th>
            <th>Spool</th>
            <th class="right">Cost</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this.records.map((record) => html`
            <tr>
              <td class="td-thumb">
                <img
                  class="row-thumb"
                  src="/api/files/thumbnail/from-gcode?filename=${encodeURIComponent(record.filename)}"
                  alt=""
                  @error=${(e: Event) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </td>
              <td>
                <div class="file-name">${record.filename}</div>
                <div class="file-sub">${record.time ? this._formatDate(record.time) : '—'} · ${record.filament_g.toFixed(1)} g</div>
              </td>
              <td class="duration">${this._formatDuration(record.duration_s)}</td>
              <td>
                ${this._assigningJobId === (record.job_id ?? record.filename)
                  ? html`<select class="spool-select"
                      @change=${(e: Event) => this._onSpoolSelect(record.job_id ?? record.filename, e)}
                      @blur=${() => { if (!this._spoolModalOpen) this._assigningJobId = null }}>
                      <option value="">pick spool…</option>
                      ${this._spools.map(s => html`<option value=${s.id}>${s.brand} ${s.material}</option>`)}
                      <option value="__new__">＋ create spool</option>
                    </select>`
                  : record.spool?.material
                    ? html`<span class="spool-tag spool-assigned"
                          title="Click to reassign"
                          @click=${() => this._assigningJobId = (record.job_id ?? record.filename)}>
                          ${record.spool.color_hex
                            ? html`<span class="spool-dot" style="background:${record.spool.color_hex}"></span>`
                            : ''}
                          ${record.spool.material}
                        </span>`
                    : html`<span class="spool-tag spool-assign"
                        @click=${() => this._assigningJobId = (record.job_id ?? record.filename)}>assign →</span>`
                }
              </td>
              <td class="right">
                ${record.cost_total != null
                  ? html`<cost-breakdown-popup .record=${record} @cost-recalculated=${() => this._load()}>
                      <div class="cost-main">€${record.cost_total.toFixed(2)}</div>
                    </cost-breakdown-popup>`
                  : html`<div class="cost-main" style="color:var(--text-dim)">—</div>
                    <div class="cost-sub">${record.filament_g.toFixed(1)} g</div>`
                }
              </td>
              <td>
                <button class="print-btn" @click=${() => this._print(record.filename)}>▶</button>
              </td>
            </tr>
          `)}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="footer-cell">
              3 of ${this._total} prints shown ·
              <a class="footer-link" @click=${() => window.router.navigate('/history')}>view all →</a>
            </td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    .loading {
      font-size: 11px;
      color: var(--text-muted);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .header-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }

    .header-link {
      font-size: 11px;
      color: var(--cyan);
      cursor: pointer;
      text-decoration: none;
    }

    .header-link:hover {
      text-decoration: underline;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    .th-thumb { width: 44px; }
    .td-thumb { width: 44px; padding-right: 8px; }
    .row-thumb {
      width: 40px;
      height: 40px;
      border-radius: 4px;
      object-fit: cover;
      display: block;
      background: var(--bg-surface);
    }

    thead th {
      font-size: 9px;
      color: var(--text-dim);
      font-weight: 400;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 0 0 8px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }

    thead th.right {
      text-align: right;
    }

    tbody tr {
      border-bottom: 1px solid var(--border-sub);
    }

    td {
      padding: 11px 0;
      vertical-align: middle;
    }

    .file-name {
      font-size: 12px;
      font-weight: 300;
      color: var(--text);
    }

    .file-sub {
      font-size: 9px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .duration {
      font-size: 11px;
      font-weight: 300;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .spool-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      margin-right: 5px;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .spool-tag {
      display: inline-flex;
      align-items: center;
      font-size: 9px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      padding: 2px 8px;
      border-radius: 3px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .spool-assign {
      border-color: var(--cyan-border);
      color: var(--cyan);
      cursor: pointer;
    }

    .spool-assign:hover {
      background: var(--cyan-dim);
    }

    .spool-assigned {
      cursor: pointer;
    }

    .spool-assigned:hover {
      border-color: #444;
      color: var(--text);
    }

    .print-btn {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-muted);
      font-size: 10px;
      padding: 3px 8px;
      cursor: pointer;
      white-space: nowrap;
    }

    .print-btn:hover {
      border-color: var(--cyan-border);
      color: var(--cyan);
      background: var(--cyan-dim);
    }

    .spool-select {
      font-size: 9px;
      background: var(--bg-raised);
      border: 1px solid var(--cyan-border);
      border-radius: 3px;
      color: var(--text);
      padding: 2px 6px;
      outline: none;
      cursor: pointer;
    }

    .right {
      text-align: right;
    }

    .cost-main {
      font-size: 13px;
      font-weight: 300;
      color: var(--cyan);
    }

    .cost-sub {
      font-size: 9px;
      color: var(--text-dim);
      margin-top: 2px;
      white-space: nowrap;
    }

    tfoot tr {
      border-top: 1px solid var(--border);
    }

    .footer-cell {
      padding-top: 10px;
      text-align: center;
      font-size: 10px;
      color: var(--text-muted);
    }

    .footer-link {
      color: var(--text-muted);
      cursor: pointer;
      text-decoration: none;
    }

    .footer-link:hover {
      color: var(--cyan);
      text-decoration: underline;
    }

    @media (max-width: 600px) {
      th:nth-child(2),
      td:nth-child(2) {
        display: none;
      }

      .spool-tag {
        font-size: 8px;
        padding: 2px 5px;
      }

      .file-name {
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cost-main {
        font-size: 11px;
      }

      .print-btn {
        padding: 2px 6px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'history-preview': HistoryPreview;
  }
}
