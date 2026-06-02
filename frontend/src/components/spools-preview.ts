import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { Spool } from '../types';
import { getSpools } from '../api';

declare const window: Window & { router: { navigate: (path: string) => void } };

@customElement('spools-preview')
export class SpoolsPreview extends LitElement {
  @state() spools: Spool[] = [];

  async connectedCallback() {
    super.connectedCallback();
    try {
      this.spools = await getSpools();
    } catch (e) {
      console.error('[spools-preview] Failed to load spools:', e);
    }
  }

  render() {
    const preview = this.spools.slice(0, 2);

    return html`
      <div class="header">
        <span class="header-label">Spools</span>
        <a class="header-link" @click=${() => window.router.navigate('/spools')}>manage →</a>
      </div>

      <div class="grid">
        ${preview.map((spool) => this._renderSpoolCard(spool))}
        ${this._renderAddCard()}
      </div>
    `;
  }

  private _renderSpoolCard(spool: Spool) {
    const pct = spool.initial_weight_g > 0
      ? Math.min(100, (spool.current_weight_g / spool.initial_weight_g) * 100)
      : 0;
    const isActive = spool.active === 1;

    return html`
      <div class="spool-card ${isActive ? 'active' : ''}">
        ${isActive ? html`<span class="active-tag">active</span>` : ''}

        <div class="spool-top">
          <div class="color-dot" style="background: ${spool.color_hex ?? '#666'}"></div>
          <div class="spool-info">
            <div class="spool-material">${spool.material}</div>
            <div class="spool-brand">${spool.brand}</div>
          </div>
        </div>

        <div class="stats">
          <div class="stat-row">
            <span class="stat-label">Cost</span>
            <span class="stat-value">€${spool.cost_per_gram.toFixed(3)}/g</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Remaining</span>
            <span class="stat-value">${spool.current_weight_g.toFixed(0)} g</span>
          </div>
        </div>

        <div class="progress-track">
          <div
            class="progress-fill"
            style="width: ${pct}%; background: ${isActive ? 'var(--cyan)' : '#444'}"
          ></div>
        </div>
      </div>
    `;
  }

  private _renderAddCard() {
    return html`
      <div class="add-card" @click=${() => window.router.navigate('/spools')}>
        add spool
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
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

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
    }

    /* ── Spool card ── */
    .spool-card {
      position: relative;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .spool-card.active {
      border-color: var(--cyan-border);
    }

    .active-tag {
      position: absolute;
      top: 10px;
      right: 10px;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--cyan);
      background: var(--cyan-dim);
      border: 1px solid var(--cyan-border);
      border-radius: 3px;
      padding: 2px 6px;
    }

    .spool-top {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .spool-info {
      min-width: 0;
    }

    .spool-material {
      font-size: 13px;
      font-weight: 400;
      color: var(--text);
      line-height: 1.2;
    }

    .spool-brand {
      font-size: 9px;
      color: var(--text-muted);
      margin-top: 1px;
    }

    .stats {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-label {
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .stat-value {
      font-size: 11px;
      font-weight: 300;
      color: var(--text);
    }

    .progress-track {
      height: 2px;
      background: var(--border);
      border-radius: 1px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 1px;
      transition: width 0.3s ease;
    }

    /* ── Add card ── */
    .add-card {
      border: 1px dashed var(--border);
      border-radius: 8px;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-dim);
      cursor: pointer;
      font-size: 11px;
      transition: border-color 0.15s, color 0.15s;
    }

    .add-card:hover {
      border-color: var(--cyan-border);
      color: var(--text-muted);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'spools-preview': SpoolsPreview;
  }
}
