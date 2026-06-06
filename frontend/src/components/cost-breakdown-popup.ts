import { LitElement, css, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { PrintRecord } from '../types'
import { recalculateCost, restoreCost } from '../api'

function fmt(n: number | null | undefined, decimals = 4): string {
  return n != null ? `€${n.toFixed(decimals)}` : '—'
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

@customElement('cost-breakdown-popup')
export class CostBreakdownPopup extends LitElement {
  @property({ type: Object }) record!: PrintRecord
  @state() private _open = false
  @state() private _recalculating = false

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }

    .trigger {
      cursor: default;
    }

    .popup {
      display: none;
      position: absolute;
      right: 0;
      top: calc(100% + 6px);
      z-index: 50;
      background: var(--bg-raised, #202020);
      border: 1px solid var(--border, #222);
      border-radius: 8px;
      padding: 14px 16px;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      text-align: left;
    }

    :host(:hover) .popup,
    .popup.open {
      display: block;
    }

    .popup-close {
      display: none;
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 14px;
      padding: 2px;
    }

    .backdrop {
      display: none;
    }

    @media (max-width: 600px) {
      /* Suppress hover-open on touch, but never hide an explicitly-opened popup */
      :host(:hover) .popup:not(.open) {
        display: none;
      }
      .popup-close {
        display: block;
      }
      .popup.open {
        position: fixed;
        inset: auto 0 0 0;
        top: auto;
        right: 0;
        border-radius: 12px 12px 0 0;
        min-width: unset;
        max-height: 70vh;
        overflow-y: auto;
        box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.6);
        z-index: 50;
      }
      .backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 49;
      }
    }

    .popup-title {
      font-size: 9px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 10px;
    }

    .popup-row {
      display: grid;
      grid-template-columns: 90px 1fr auto;
      gap: 6px;
      align-items: baseline;
      padding: 5px 0;
      border-bottom: 1px solid #282828;
      font-size: 11px;
    }

    .popup-row:last-of-type {
      border-bottom: none;
    }

    .row-label {
      color: #999;
      font-size: 10px;
    }

    .row-formula {
      color: #666;
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .row-value {
      color: #e0e0e0;
      font-weight: 300;
      text-align: right;
      white-space: nowrap;
    }

    .divider {
      height: 1px;
      background: #2a2a2a;
      margin: 8px 0;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-top: 4px;
    }

    .total-label {
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .total-value {
      font-size: 16px;
      font-weight: 200;
      color: var(--cyan, #22d3ee);
      letter-spacing: -0.5px;
    }

    .recalc-btn {
      margin-top: 10px;
      width: 100%;
      background: none;
      border: 1px dashed var(--border, #333);
      border-radius: 4px;
      color: var(--text-muted, #555);
      font-size: 10px;
      padding: 5px 10px;
      cursor: pointer;
    }

    .recalc-btn:hover {
      color: var(--cyan, #22d3ee);
      border-color: var(--cyan, #22d3ee);
    }
    .recalc-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .warning-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      padding: 6px 8px;
      background: #78350f22;
      border: 1px solid #92400e44;
      border-radius: 4px;
      font-size: 10px;
      color: #fbbf24;
    }
  `

  private async _recalculate(e: Event) {
    e.stopPropagation()
    if (!this.record.job_id) return
    this._recalculating = true
    try {
      await recalculateCost(this.record.job_id)
      this.dispatchEvent(new CustomEvent('cost-recalculated', { bubbles: true, composed: true }))
    } catch (err) {
      console.error('Recalculate failed', err)
    } finally {
      this._recalculating = false
    }
  }

  private async _restore(e: Event) {
    e.stopPropagation()
    if (!this.record.job_id) return
    this._recalculating = true
    try {
      await restoreCost(this.record.job_id)
      this.dispatchEvent(new CustomEvent('cost-recalculated', { bubbles: true, composed: true }))
    } catch (err) {
      console.error('Restore failed', err)
    } finally {
      this._recalculating = false
    }
  }

  render() {
    const r = this.record
    const filG = r.filament_g ?? 0
    const cpg = r.cost_filament != null && filG > 0 ? r.cost_filament / filG : null
    const durationH = (r.duration_s ?? 0) / 3600
    const avgW = r.avg_watts
    const avgP = r.avg_eur_per_kwh
    const energyKwh = avgW != null ? (avgW * durationH) / 1000 : null
    const missingElectricity = avgW == null || avgW === 0

    return html`
      <div
        class="trigger"
        @click=${() => {
          this._open = !this._open
        }}
      >
        <slot></slot>
      </div>
      ${this._open
        ? html`<div
            class="backdrop"
            @click=${() => {
              this._open = false
            }}
          ></div>`
        : ''}
      <div class="popup ${this._open ? 'open' : ''}">
        <button
          class="popup-close"
          @click=${(e: Event) => {
            e.stopPropagation()
            this._open = false
          }}
        >
          ×
        </button>
        <div class="popup-title">Cost breakdown</div>

        <div class="popup-row">
          <span class="row-label">Filament</span>
          <span class="row-formula"> ${filG.toFixed(1)} g ${cpg != null ? html`× €${cpg.toFixed(4)}/g` : ''} </span>
          <span class="row-value">${fmt(r.cost_filament)}</span>
        </div>

        <div class="popup-row">
          <span class="row-label">Electricity</span>
          <span class="row-formula">
            ${missingElectricity
              ? html`<span style="color:#fbbf24">⚠ no sensor data</span>`
              : html`${energyKwh!.toFixed(4)} kWh × €${(avgP ?? 0).toFixed(4)}`}
          </span>
          <span class="row-value"
            >${missingElectricity ? html`<span style="color:#555">—</span>` : fmt(r.cost_electricity)}</span
          >
        </div>

        <div class="popup-row">
          <span class="row-label">Print time</span>
          <span class="row-formula">${fmtDur(r.duration_s ?? 0)}</span>
          <span class="row-value"></span>
        </div>

        ${avgW != null
          ? html`
              <div class="popup-row">
                <span class="row-label">Avg draw</span>
                <span class="row-formula">${avgW.toFixed(1)} W (HA sensor)</span>
                <span class="row-value"></span>
              </div>
            `
          : ''}
        ${avgP != null
          ? html`
              <div class="popup-row">
                <span class="row-label">Avg price</span>
                <span class="row-formula">€${avgP.toFixed(4)}/kWh (at print time)</span>
                <span class="row-value"></span>
              </div>
            `
          : ''}

        <div class="divider"></div>

        <div class="total-row">
          <span class="total-label"
            >Total${missingElectricity
              ? html` <span style="color:#fbbf24;font-size:9px">⚠ incomplete</span>`
              : ''}</span
          >
          <span class="total-value">${fmt(r.cost_total, 4)}</span>
        </div>

        ${missingElectricity
          ? html`<div class="warning-row">
              ⚠ Electricity cost missing — sensor was unavailable or not yet set up at print time
            </div>`
          : ''}
        ${r.spool && (r.cost_total == null || r.cost_total === 0)
          ? html`
              <button class="recalc-btn" ?disabled=${this._recalculating} @click=${this._recalculate}>
                ${this._recalculating ? 'Recalculating…' : '↻ Recalculate cost from HA'}
              </button>
            `
          : ''}
        ${!r.spool || (r.cost_total != null && r.cost_total > 0.001)
          ? ''
          : html`
              <button class="recalc-btn" ?disabled=${this._recalculating} @click=${this._restore}>
                ${this._recalculating ? 'Restoring…' : '↻ Restore cost from HA history'}
              </button>
            `}
        ${r.cost_total != null && r.cost_total > 0 && r.cost_total < 0.01
          ? html`
              <button
                class="recalc-btn"
                style="border-color: #ef444444; color: #ef4444;"
                ?disabled=${this._recalculating}
                @click=${this._restore}
              >
                ${this._recalculating ? 'Restoring…' : '⚠ Cost looks wrong — restore from HA'}
              </button>
            `
          : ''}
      </div>
    `
  }
}
