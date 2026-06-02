import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { Spool } from '../types'
import { getSpools, deleteSpool, updateSpool } from '../api'

import '../components/spool-modal'

@customElement('spools-page')
export class SpoolsPage extends LitElement {
  createRenderRoot() { return this }

  @state() spools: Spool[] = []
  @state() editingSpool: Spool | null = null
  @state() modalOpen = false

  connectedCallback() {
    super.connectedCallback()
    this._reload()
  }

  private async _reload() {
    this.spools = await getSpools()
  }

  private async _setActive(id: number) {
    await updateSpool(id, { active: 1 } as Partial<Spool>)
    await this._reload()
  }

  private async _delete(id: number) {
    if (!confirm('Delete this spool?')) return
    const r = await deleteSpool(id)
    if (r.status === 409) {
      alert('Spool has linked prints')
      return
    }
    await this._reload()
  }

  private _weightBar(_spool: Spool) {
    return html``
  }

  private _spoolCard(spool: Spool) {
    const isActive = Boolean(spool.active)
    const dot = spool.color_hex
      ? html`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${spool.color_hex};flex-shrink:0"></span>`
      : html``

    return html`
      <div style="background:#1a1a1a;border:1px solid ${isActive ? '#22d3ee33' : '#222'};border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:0">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:2px">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            ${dot}
            <span style="font-weight:600;color:#e0e0e0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${spool.brand}</span>
          </div>
          ${isActive ? html`<span style="font-size:10px;font-weight:600;background:#22d3ee22;color:#22d3ee;border:1px solid #22d3ee44;border-radius:4px;padding:1px 6px;white-space:nowrap;margin-left:6px">ACTIVE</span>` : html``}
        </div>

        <div style="font-size:12px;color:#555;margin-bottom:4px">${spool.material} · ${spool.color}</div>
        <div style="font-size:12px;color:#555">€${(spool.cost_per_gram * spool.initial_weight_g).toFixed(2)} · €${spool.cost_per_gram.toFixed(4)}/g</div>

        ${this._weightBar(spool)}

        ${spool.notes ? html`<div style="font-size:11px;color:#444;margin-top:8px;font-style:italic">${spool.notes}</div>` : html``}

        <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">
          ${!isActive ? html`
            <button
              style="flex:1;background:transparent;border:1px solid #333;color:#e0e0e0;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap"
              @click=${() => this._setActive(spool.id)}
            >Set active</button>
          ` : html``}
          <button
            style="flex:1;background:transparent;border:1px solid #333;color:#e0e0e0;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap"
            @click=${() => { this.editingSpool = spool; this.modalOpen = true }}
          >Edit</button>
          <button
            style="flex:1;background:transparent;border:1px solid #33181888;color:#ef4444;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap"
            @click=${() => this._delete(spool.id)}
          >Delete</button>
        </div>
      </div>
    `
  }

  render() {
    return html`
      <div style="max-width:940px;margin:0 auto;padding:28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <span style="font-size:18px;font-weight:600;color:#e0e0e0">Spools</span>
          <button
            style="background:transparent;border:1px solid #22d3ee44;color:#22d3ee;border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer"
            @click=${() => { this.editingSpool = null; this.modalOpen = true }}
          >+ add spool</button>
        </div>

        ${this.spools.length === 0
          ? html`<div style="color:#555;text-align:center;padding:40px">No spools yet.</div>`
          : html`
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
              ${this.spools.map(s => this._spoolCard(s))}
            </div>
          `}
      </div>

      <spool-modal
        .open=${this.modalOpen}
        .spool=${this.editingSpool}
        @close=${() => { this.modalOpen = false }}
        @spool-saved=${() => { this.modalOpen = false; this._reload() }}
      ></spool-modal>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'spools-page': SpoolsPage
  }
}
