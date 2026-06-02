import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { PrintRecord } from '../types';
import { getHistory } from '../api';

declare const window: Window & { router: { navigate: (path: string) => void } };

@customElement('history-preview')
export class HistoryPreview extends LitElement {
  @state() records: PrintRecord[] = [];
  @state() loading = true;

  private _total = 0;

  async connectedCallback() {
    super.connectedCallback();
    try {
      const data = await getHistory(3, 0);
      this.records = data.records;
      this._total = data.total;
    } catch (e) {
      console.error('[history-preview] Failed to load history:', e);
    } finally {
      this.loading = false;
    }
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
      <div class="header">
        <span class="header-label">Recent prints</span>
        <a class="header-link" @click=${() => window.router.navigate('/history')}>view all →</a>
      </div>

      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Duration</th>
            <th>Spool</th>
            <th class="right">Cost</th>
          </tr>
        </thead>
        <tbody>
          ${this.records.map((record) => html`
            <tr>
              <td>
                <div class="file-name">${record.filename}</div>
                <div class="file-sub">${this._formatDate(record.time)} · ${record.filament_g.toFixed(1)} g</div>
              </td>
              <td class="duration">${this._formatDuration(record.duration_s)}</td>
              <td>
                ${record.spool?.material
                  ? html`<span class="spool-tag">${record.spool.material}</span>`
                  : html`<span class="spool-tag spool-assign">assign →</span>`
                }
              </td>
              <td class="right">
                <div class="cost-main">€${record.cost_total.toFixed(2)}</div>
                <div class="cost-sub">€${record.cost_electricity.toFixed(2)} elec · €${record.cost_filament.toFixed(2)} fil</div>
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

    .spool-tag {
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'history-preview': HistoryPreview;
  }
}
