import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { PrintRecord, Spool } from '../types'
import { getHistory, getSpools, assignSpool } from '../api'

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
    if (record.spool) {
      const s = record.spool
      const dot = s.color_hex
        ? html`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color_hex};margin-right:4px;vertical-align:middle"></span>`
        : html``
      return html`<span style="display:inline-flex;align-items:center;background:#1a1a1a;border:1px solid #222;border-radius:4px;padding:2px 7px;font-size:12px;color:#e0e0e0">${dot}${s.brand ?? ''} ${s.material ?? ''}</span>`
    }

    const jobId = record.job_id || record.filename
    const isAssigning = this.assigningJobId === jobId

    return html`
      <div style="display:flex;align-items:center;gap:6px">
        <select
          id="spool-select-${jobId}"
          style="background:#1a1a1a;border:1px solid #333;color:#e0e0e0;border-radius:4px;padding:2px 6px;font-size:12px"
        >
          <option value="">— spool —</option>
          ${this.spools.map(s => html`<option value="${s.id}">${s.brand} ${s.material}</option>`)}
        </select>
        <button
          style="background:#22d3ee;color:#0e0e0e;border:none;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;opacity:${isAssigning ? '0.5' : '1'}"
          ?disabled=${isAssigning}
          @click=${async (e: Event) => {
            const btn = e.target as HTMLButtonElement
            const select = btn.parentElement!.querySelector('select') as HTMLSelectElement
            const val = Number(select.value)
            if (!val) return
            this.assigningJobId = jobId
            await this._assign(record, val)
            this.assigningJobId = null
          }}
        >Assign</button>
      </div>
    `
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
                  <th>Cost breakdown</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${this.records.map(r => html`
                  <tr>
                    <td class="filename-cell" title="${r.filename}">${r.filename}</td>
                    <td style="white-space:nowrap">${this.fmtDate(r.time)}</td>
                    <td style="white-space:nowrap">${this.fmtDuration(r.duration_s)}</td>
                    <td style="white-space:nowrap">${r.filament_g.toFixed(1)} g</td>
                    <td>${this._spoolTag(r)}</td>
                    <td style="white-space:nowrap;color:#888">€${r.cost_electricity.toFixed(2)} elec + €${r.cost_filament.toFixed(2)} fil</td>
                    <td style="white-space:nowrap;color:#22d3ee;font-weight:600">€${r.cost_total.toFixed(2)}</td>
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
