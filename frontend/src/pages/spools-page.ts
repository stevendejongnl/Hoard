import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { Spool } from '../types'
import { getSpools, deleteSpool, updateSpool } from '../api'

import '../components/spool-modal'

const styles = html`<style>
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
  .add-btn {
    background: transparent;
    border: 1px solid #22d3ee44;
    color: #22d3ee;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 13px;
    cursor: pointer;
    min-height: 44px;
  }
  .add-btn:hover,
  .add-btn:active {
    background: #22d3ee14;
  }
  .spools-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .spool-card {
    background: #1a1a1a;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .spool-card.active {
    border: 1px solid #22d3ee33;
  }
  .spool-card:not(.active) {
    border: 1px solid #222;
  }
  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .card-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .card-brand {
    font-weight: 600;
    color: #e0e0e0;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .active-badge {
    font-size: 10px;
    font-weight: 600;
    background: #22d3ee22;
    color: #22d3ee;
    border: 1px solid #22d3ee44;
    border-radius: 4px;
    padding: 2px 6px;
    white-space: nowrap;
    margin-left: 6px;
    flex-shrink: 0;
  }
  .card-meta {
    font-size: 12px;
    color: #888;
  }
  .card-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .action-btn {
    flex: 1;
    background: transparent;
    border: 1px solid #333;
    color: #e0e0e0;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    min-height: 44px;
    text-align: center;
  }
  .action-btn:hover,
  .action-btn:active {
    border-color: #555;
  }
  .action-btn.danger {
    color: #ef4444;
    border-color: #33181888;
  }
  .action-btn.danger:hover,
  .action-btn.danger:active {
    border-color: #ef4444;
    background: #ef444410;
  }
  .empty {
    color: #555;
    text-align: center;
    padding: 40px;
  }

  @media (max-width: 900px) {
    .spools-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 600px) {
    .page-wrap {
      padding: 16px;
    }
    .spools-grid {
      grid-template-columns: 1fr;
    }
  }
</style>`

@customElement('spools-page')
export class SpoolsPage extends LitElement {
  createRenderRoot() {
    return this
  }

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
      ? html`<span
          style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${spool.color_hex};flex-shrink:0"
        ></span>`
      : html``

    return html`
      <div class="spool-card ${isActive ? 'active' : ''}">
        <div class="card-header">
          <div class="card-name-row">
            ${dot}
            <span class="card-brand">${spool.brand}</span>
          </div>
          ${isActive ? html`<span class="active-badge">ACTIVE</span>` : html``}
        </div>

        <div class="card-meta">${spool.material} · ${spool.color}</div>
        <div class="card-meta">
          €${(spool.cost_per_gram * spool.initial_weight_g).toFixed(2)} · €${spool.cost_per_gram.toFixed(4)}/g
        </div>

        ${this._weightBar(spool)}
        ${spool.notes ? html`<div style="font-size:11px;color:#444;font-style:italic">${spool.notes}</div>` : html``}

        <div class="card-actions">
          ${!isActive
            ? html` <button class="action-btn" @click=${() => this._setActive(spool.id)}>Set active</button> `
            : html``}
          <button
            class="action-btn"
            @click=${() => {
              this.editingSpool = spool
              this.modalOpen = true
            }}
          >
            Edit
          </button>
          <button class="action-btn danger" @click=${() => this._delete(spool.id)}>Delete</button>
        </div>
      </div>
    `
  }

  render() {
    return html`
      ${styles}
      <div class="page-wrap">
        <div class="page-header">
          <span class="page-title">Spools</span>
          <button
            class="add-btn"
            @click=${() => {
              this.editingSpool = null
              this.modalOpen = true
            }}
          >
            + add spool
          </button>
        </div>

        ${this.spools.length === 0
          ? html`<div class="empty">No spools yet.</div>`
          : html` <div class="spools-grid">${this.spools.map((s) => this._spoolCard(s))}</div> `}
      </div>

      <spool-modal
        .open=${this.modalOpen}
        .spool=${this.editingSpool}
        @close=${() => {
          this.modalOpen = false
        }}
        @spool-saved=${() => {
          this.modalOpen = false
          this._reload()
        }}
      ></spool-modal>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'spools-page': SpoolsPage
  }
}
