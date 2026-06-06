import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { ProjectLink } from '../types'

@customElement('link-preview-card')
export class LinkPreviewCard extends LitElement {
  @property({ type: Object }) link!: ProjectLink

  @state() private _visible = false
  private _showTimer = 0
  private _hideTimer = 0

  private _isTouch() {
    return window.matchMedia('(hover: none)').matches
  }

  // Attached to the host element (light DOM) so it intercepts slotted <a> clicks
  private _hostClick = (e: Event) => {
    if (!this._isTouch()) return
    if (!this.link?.meta?.title && !this.link?.meta?.image_url) return
    e.preventDefault()
    e.stopPropagation()
    this._visible = !this._visible
  }

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this._hostClick)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('click', this._hostClick)
  }

  private _show() {
    if (this._isTouch()) return
    clearTimeout(this._hideTimer)
    this._showTimer = window.setTimeout(() => { this._visible = true }, 120)
  }

  private _hide() {
    if (this._isTouch()) return
    clearTimeout(this._showTimer)
    this._hideTimer = window.setTimeout(() => { this._visible = false }, 150)
  }

  private _closeCard() {
    this._visible = false
  }

  static styles = css`
    :host { display: block; position: relative; }

    .card {
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      width: 280px;
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
      z-index: 100;
      overflow: hidden;
      animation: fade-in 0.12s ease;
    }

    .card.visible { display: block; }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .cover {
      width: 100%;
      height: 120px;
      object-fit: cover;
      display: block;
      background: #141414;
    }

    .body { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }

    .title {
      font-size: 12px;
      font-weight: 600;
      color: #e0e0e0;
      line-height: 1.3;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .desc {
      font-size: 11px;
      color: #888;
      line-height: 1.5;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .chip {
      font-size: 9px;
      background: #141414;
      color: #666;
      border: 1px solid #2a2a2a;
      border-radius: 3px;
      padding: 1px 6px;
      white-space: nowrap;
    }

    .footer {
      padding: 8px 12px;
      border-top: 1px solid #2a2a2a;
    }

    .open-btn {
      display: block;
      width: 100%;
      background: transparent;
      border: 1px solid #22d3ee33;
      color: #22d3ee;
      border-radius: 5px;
      padding: 6px 10px;
      font-size: 11px;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      box-sizing: border-box;
    }

    .open-btn:hover, .open-btn:active {
      background: #22d3ee14;
    }

    /* Mobile: card is wider and positioned fixed to avoid viewport overflow */
    @media (max-width: 600px) {
      .card {
        position: fixed;
        bottom: 16px;
        left: 16px;
        right: 16px;
        width: auto;
      }
    }
  `

  render() {
    const m = this.link?.meta
    const ps = m?.print_settings
    const psEntries = ps ? Object.entries(ps).filter(([, v]) => v) : []
    const hasContent = m?.title || m?.description || m?.image_url

    return html`
      <div
        @mouseenter=${this._show}
        @mouseleave=${this._hide}
      >
        <slot></slot>
      </div>

      ${hasContent ? html`
        <div
          class="card ${this._visible ? 'visible' : ''}"
          @mouseenter=${this._show}
          @mouseleave=${this._hide}
        >
          ${m?.image_url ? html`
            <img
              class="cover"
              src="${m.image_url}"
              alt=""
              @error=${(e: Event) => { (e.target as HTMLElement).style.display = 'none' }}
            />
          ` : ''}
          <div class="body">
            ${m?.title ? html`<div class="title">${m.title}</div>` : ''}
            ${m?.description ? html`<div class="desc">${m.description}</div>` : ''}
            ${psEntries.length > 0 ? html`
              <div class="chips">
                ${psEntries.map(([k, v]) => html`
                  <span class="chip">${_label(k)}: ${v}</span>
                `)}
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <a
              class="open-btn"
              href="${this.link.url}"
              target="_blank"
              rel="noopener"
              @click=${this._closeCard}
            >Open link ↗</a>
          </div>
        </div>
      ` : ''}
    `
  }
}

const _LABELS: Record<string, string> = {
  layer_height: 'Layer', walls: 'Walls', infill: 'Infill',
  nozzle: 'Nozzle', material: 'Material', printer: 'Printer',
  weight_g: 'Weight', parts: 'Parts',
}
function _label(k: string) { return _LABELS[k] ?? k }

declare global {
  interface HTMLElementTagNameMap { 'link-preview-card': LinkPreviewCard }
}
