import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { PrintRecord, Spool } from '../types'
import { getHistory, getSpools, assignSpool } from '../api'
import { sseClient } from '../sse'
import '../components/cost-breakdown-popup'
import '../components/print-ready-modal'

@customElement('history-page')
export class HistoryPage extends LitElement {
  createRenderRoot() { return this }

  @state() records: PrintRecord[] = []
  @state() total = 0
  @state() page = 0
  @state() loading = true
  @state() spools: Spool[] = []
  @state() assigningJobId: string | null = null
  private _unsubscribe: (() => void) | null = null

  connectedCallback() {
    super.connectedCallback()
    this._loadPage(0)
    this._unsubscribe = sseClient.subscribe((payload) => {
      if (payload.type === 'history_updated') {
        this._loadPage(this.page)
      }
    })
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._unsubscribe?.()
    this._unsubscribe = null
  }

  private async _loadPage(p: number) {
    this.loading = true
    const history = await getHistory(20, p * 20)
    this.records = history.records
    this.total = history.total
    this.page = p
    this.loading = false
  }

  private _print(filename: string) {
    const modal = document.querySelector<any>('print-ready-modal')
    modal?.tryPrint(filename)
  }

  private fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  private fmtDuration(s: number) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return `${h}h ${m}m`
  }

  private async _assign(record: PrintRecord, spoolId: number) {
    const jobId = record.job_id || record.filename
    await assignSpool(jobId, spoolId)
    await this._loadPage(this.page)
  }

  private _spoolTag(record: PrintRecord) {
    const jobId = record.job_id || record.filename
    const isAssigning = this.assigningJobId === jobId

    if (isAssigning) {
      return html`
        <div style="display:flex;align-items:center;gap:6px">
          <select
            style="background:#1a1a1a;border:1px solid #22d3ee28;color:#e0e0e0;border-radius:4px;padding:2px 6px;font-size:11px;outline:none"
            @change=${async (e: Event) => {
              const val = Number((e.target as HTMLSelectElement).value)
              if (!val) { this.assigningJobId = null; return }
              this.assigningJobId = jobId
              await this._assign(record, val)
              this.assigningJobId = null
            }}
            @blur=${() => { this.assigningJobId = null }}
          >
            <option value="">pick spool…</option>
            ${this.spools.map(s => html`<option value="${s.id}">${s.brand} ${s.material}</option>`)}
          </select>
        </div>
      `
    }

    if (record.spool) {
      const s = record.spool
      const dot = s.color_hex
        ? html`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color_hex};margin-right:5px;vertical-align:middle;flex-shrink:0"></span>`
        : html``
      return html`<span
        class="spool-tag spool-tag--assigned"
        title="Click to reassign"
        @click=${() => { this.assigningJobId = jobId }}
      >${dot}${s.brand ?? ''} ${s.material ?? ''}</span>`
    }

    return html`<span
      class="spool-tag spool-tag--unassigned"
      @click=${() => { this.assigningJobId = jobId }}
    >assign →</span>`
  }

  render() {
    const totalPages = Math.ceil(this.total / 20)

    return html`
      <print-ready-modal></print-ready-modal>
      <style>
        /* ── Base layout ── */
        .page-wrap {
          max-width: 940px;
          margin: 0 auto;
          padding: 28px;
        }
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .page-title {
          font-size: 18px;
          font-weight: 600;
          color: #e0e0e0;
        }
        .page-count {
          color: #555;
          font-size: 13px;
        }

        /* ── Spool tags ── */
        .spool-tag {
          display: inline-flex;
          align-items: center;
          border-radius: 4px;
          padding: 2px 7px;
          font-size: 11px;
          cursor: pointer;
          min-height: 44px;
          box-sizing: border-box;
        }
        .spool-tag--assigned {
          background: #1a1a1a;
          border: 1px solid #222;
          color: #e0e0e0;
        }
        .spool-tag--assigned:hover,
        .spool-tag--assigned:active {
          border-color: #444;
        }
        .spool-tag--unassigned {
          background: transparent;
          border: 1px solid #22d3ee28;
          color: #22d3ee;
        }
        .spool-tag--unassigned:hover,
        .spool-tag--unassigned:active {
          border-color: #22d3ee88;
        }

        /* ── Print (▶) button ── */
        .print-btn {
          background: transparent;
          border: 1px solid #222;
          border-radius: 4px;
          color: #888;
          font-size: 10px;
          padding: 3px 8px;
          cursor: pointer;
          min-width: 44px;
          min-height: 44px;
          box-sizing: border-box;
        }
        .print-btn:hover,
        .print-btn:active {
          border-color: #22d3ee28;
          color: #22d3ee;
          background: #22d3ee14;
        }

        /* ── Pager ── */
        .pager-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 20px;
        }
        .pager-btn {
          background: #1a1a1a;
          border: 1px solid #222;
          color: #e0e0e0;
          border-radius: 6px;
          padding: 6px 16px;
          cursor: pointer;
          font-size: 13px;
        }
        .pager-btn:disabled {
          opacity: 0.3;
          cursor: default;
        }
        .pager-btn:not(:disabled):hover,
        .pager-btn:not(:disabled):active {
          border-color: #22d3ee;
          color: #22d3ee;
        }
        .pager-info {
          color: #555;
          font-size: 13px;
        }

        /* ── Desktop table ── */
        .history-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .history-table th {
          text-align: left;
          color: #555;
          font-weight: 500;
          padding: 6px 10px;
          border-bottom: 1px solid #222;
          white-space: nowrap;
        }
        .history-table td {
          padding: 9px 10px;
          border-bottom: 1px solid #1a1a1a;
          color: #e0e0e0;
          vertical-align: middle;
        }
        .history-table tr:last-child td {
          border-bottom: none;
        }
        .history-table tr:hover td {
          background: #141414;
        }
        .filename-cell {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #aaa;
          font-family: monospace;
          font-size: 12px;
        }

        /* ── Mobile cards ── */
        .card-list {
          display: none;
          flex-direction: column;
          gap: 8px;
        }
        .print-card {
          background: #141414;
          border: 1px solid #222;
          border-radius: 8px;
          padding: 12px 14px;
        }
        .print-card__top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
        }
        .print-card__filename {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #aaa;
          font-family: monospace;
          font-size: 12px;
        }
        .print-card__meta {
          color: #666;
          font-size: 12px;
          margin-bottom: 8px;
        }
        .print-card__bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .print-card__cost {
          color: #22d3ee;
          font-weight: 600;
          font-size: 13px;
          white-space: nowrap;
        }
        .print-card__cost--none {
          color: #555;
        }

        /* ── Responsive breakpoints ── */
        @media (max-width: 600px) {
          .page-wrap {
            padding: 16px;
          }
          .history-table {
            display: none;
          }
          .card-list {
            display: flex;
          }
          .pager-row {
            margin-top: 16px;
          }
          .pager-btn {
            padding: 10px 14px;
          }
        }

        @media (min-width: 601px) {
          .card-list {
            display: none;
          }
        }
      </style>

      <div class="page-wrap">
        <div class="page-header">
          <span class="page-title">Print history</span>
          <span class="page-count">${this.total} prints</span>
        </div>

        ${this.loading
          ? html`<div style="color:#555;text-align:center;padding:40px">Loading…</div>`
          : html`
            <!-- Desktop table -->
            <table class="history-table">
              <thead>
                <tr>
                  <th style="width:44px"></th>
                  <th>File</th>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Filament</th>
                  <th>Spool</th>
                  <th style="text-align:right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${this.records.map(r => html`
                  <tr>
                    <td style="width:44px;padding-right:8px">
                      <img
                        style="width:40px;height:40px;border-radius:4px;object-fit:cover;display:block;background:var(--bg-surface,#1a1a1a)"
                        src="/api/files/thumbnail/from-gcode?filename=${encodeURIComponent(r.filename)}"
                        alt=""
                        loading="lazy"
                        @error=${(e: Event) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </td>
                    <td class="filename-cell" title="${r.filename}">${r.filename}</td>
                    <td style="white-space:nowrap">${r.time ? this.fmtDate(r.time) : '—'}</td>
                    <td style="white-space:nowrap">${this.fmtDuration(r.duration_s)}</td>
                    <td style="white-space:nowrap">${r.filament_g.toFixed(1)} g</td>
                    <td>${this._spoolTag(r)}</td>
                    <td style="white-space:nowrap;text-align:right">
                      ${r.cost_total != null
                        ? html`<cost-breakdown-popup .record=${r} style="color:#22d3ee;font-weight:600;font-size:13px">€${r.cost_total.toFixed(2)}</cost-breakdown-popup>`
                        : html`<span style="color:#555">—</span>`}
                    </td>
                    <td>
                      <button
                        class="print-btn"
                        @click=${() => this._print(r.filename)}
                      >▶</button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>

            <!-- Mobile card list -->
            <div class="card-list">
              ${this.records.map(r => html`
                <div class="print-card">
                  <div class="print-card__top">
                    <span class="print-card__filename" title="${r.filename}">${r.filename}</span>
                    <button
                      class="print-btn"
                      @click=${() => this._print(r.filename)}
                    >▶</button>
                  </div>
                  <div class="print-card__meta">
                    ${r.time ? this.fmtDate(r.time) : '—'} · ${r.filament_g.toFixed(1)} g · ${this.fmtDuration(r.duration_s)}
                  </div>
                  <div class="print-card__bottom">
                    ${this._spoolTag(r)}
                    <span class="${r.cost_total != null ? 'print-card__cost' : 'print-card__cost print-card__cost--none'}">
                      ${r.cost_total != null
                        ? html`<cost-breakdown-popup .record=${r} style="color:#22d3ee;font-weight:600;font-size:13px">€${r.cost_total.toFixed(2)}</cost-breakdown-popup>`
                        : html`—`}
                    </span>
                  </div>
                </div>
              `)}
            </div>

            <div class="pager-row">
              <button
                class="pager-btn"
                ?disabled=${this.page === 0}
                @click=${() => this._loadPage(this.page - 1)}
              >← Previous</button>
              <span class="pager-info">Page ${this.page + 1} of ${totalPages || 1}</span>
              <button
                class="pager-btn"
                ?disabled=${this.page >= totalPages - 1}
                @click=${() => this._loadPage(this.page + 1)}
              >Next →</button>
            </div>
          `}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'history-page': HistoryPage
  }
}
