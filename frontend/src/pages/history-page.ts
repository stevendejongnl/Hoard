import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { PrintRecord, Spool } from '../types'
import { getHistory, getSpools, assignSpool, startPrint } from '../api'
import '../components/cost-breakdown-popup'

@customElement('history-page')
export class HistoryPage extends LitElement {
  createRenderRoot() { return this }

  @state() records: PrintRecord[] = []
  @state() total = 0
  @state() page = 0
  @state() loading = true
  @state() spools: Spool[] = []
  @state() assigningJobId: string | null = null

  connectedCallback() {
    super.connectedCallback()
    Promise.all([getSpools(), getHistory(20, 0)]).then(([spools, history]) => {
      this.spools = spools
      this.records = history.records
      this.total = history.total
      this.loading = false
    })
  }

  private async _loadPage(p: number) {
    this.loading = true
    const history = await getHistory(20, p * 20)
    this.records = history.records
    this.total = history.total
    this.page = p
    this.loading = false
  }

  private async _print(filename: string) {
    if (!window.confirm(`Print ${filename}?`)) return
    try { await startPrint(filename) }
    catch (e) { window.alert(`Failed: ${e}`) }
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
        title="Click to reassign"
        style="display:inline-flex;align-items:center;background:#1a1a1a;border:1px solid #222;border-radius:4px;padding:2px 7px;font-size:11px;color:#e0e0e0;cursor:pointer"
        @click=${() => { this.assigningJobId = jobId }}
        @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.borderColor = '#444' }}
        @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.borderColor = '#222' }}
      >${dot}${s.brand ?? ''} ${s.material ?? ''}</span>`
    }

    return html`<span
      style="display:inline-flex;align-items:center;background:transparent;border:1px solid #22d3ee28;border-radius:4px;padding:2px 7px;font-size:11px;color:#22d3ee;cursor:pointer"
      @click=${() => { this.assigningJobId = jobId }}
    >assign →</span>`
  }

  render() {
    const totalPages = Math.ceil(this.total / 20)

    return html`
      <style>
        .history-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .history-table th { text-align: left; color: #555; font-weight: 500; padding: 6px 10px; border-bottom: 1px solid #222; white-space: nowrap; }
        .history-table td { padding: 9px 10px; border-bottom: 1px solid #1a1a1a; color: #e0e0e0; vertical-align: middle; }
        .history-table tr:last-child td { border-bottom: none; }
        .history-table tr:hover td { background: #141414; }
        .filename-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #aaa; font-family: monospace; font-size: 12px; }
        .pager-btn { background: #1a1a1a; border: 1px solid #222; color: #e0e0e0; border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 13px; }
        .pager-btn:disabled { opacity: 0.3; cursor: default; }
        .pager-btn:not(:disabled):hover { border-color: #22d3ee; color: #22d3ee; }
      </style>

      <div style="max-width:940px;margin:0 auto;padding:28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <span style="font-size:18px;font-weight:600;color:#e0e0e0">Print history</span>
          <span style="color:#555;font-size:13px">${this.total} prints</span>
        </div>

        ${this.loading
          ? html`<div style="color:#555;text-align:center;padding:40px">Loading…</div>`
          : html`
            <table class="history-table">
              <thead>
                <tr>
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
                        @click=${() => this._print(r.filename)}
                        style="background:transparent;border:1px solid #222;border-radius:4px;color:#888;font-size:10px;padding:3px 8px;cursor:pointer"
                        onmouseover="this.style.borderColor='#22d3ee28';this.style.color='#22d3ee';this.style.background='#22d3ee14'"
                        onmouseout="this.style.borderColor='#222';this.style.color='#888';this.style.background='transparent'"
                      >▶</button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px">
              <button
                class="pager-btn"
                ?disabled=${this.page === 0}
                @click=${() => this._loadPage(this.page - 1)}
              >← Previous</button>
              <span style="color:#555;font-size:13px">Page ${this.page + 1} of ${totalPages || 1}</span>
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
