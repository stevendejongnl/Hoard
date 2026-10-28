import { LitElement, html, css } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { ProjectLink } from '../types'

@customElement('link-preview-card')
export class LinkPreviewCard extends LitElement {
  @property({ type: Object }) link!: ProjectLink
  @state() private _visible = false
  private _showTimer = 0
  private _hideTimer = 0

  /** Replaceable so tests, and browsers without media queries, decide what counts as a touch screen. */
  @property({ attribute: false }) isTouchScreen: () => boolean = () =>
    window.matchMedia?.('(hover: none)').matches ?? false

  private _isTouch() {
    return this.isTouchScreen()
  }

  private _hasContent() {
    return !!(this.link?.meta?.title || this.link?.meta?.image_url)
  }

  // All events on the host element — avoids Shadow DOM / slotted-content event issues
  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('mouseenter', this._onEnter)
    this.addEventListener('mouseleave', this._onLeave)
    this.addEventListener('click', this._onClick, true)
    document.addEventListener('click', this._onOutsideClick, true)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('mouseenter', this._onEnter)
    this.removeEventListener('mouseleave', this._onLeave)
    this.removeEventListener('click', this._onClick, true)
    document.removeEventListener('click', this._onOutsideClick, true)
  }

  private _onOutsideClick = (event: Event) => {
    if (!this._visible) return
    if (!this._isTouch()) return // desktop uses mouseleave to hide
    if (!this.contains(event.target as Node)) {
      this._visible = false
    }
  }

  private _onEnter = () => {
    if (this._isTouch()) return
    clearTimeout(this._hideTimer)
    this._showTimer = window.setTimeout(() => {
      this._visible = true
    }, 120)
  }

  private _onLeave = () => {
    if (this._isTouch()) return
    clearTimeout(this._showTimer)
    this._hideTimer = window.setTimeout(() => {
      this._visible = false
    }, 150)
  }

  private _onClick = (event: Event) => {
    if (!this._isTouch()) return // desktop: don't intercept, let <a> navigate
    if (!this._hasContent()) return // nothing to show, let <a> navigate
    if (event.composedPath().some((target) => target instanceof Element && target.classList.contains('card'))) return // click inside popup card
    event.preventDefault()
    event.stopImmediatePropagation()
    this._visible = !this._visible
  }

  private _open(event: Event) {
    event.stopPropagation()
    this._visible = false
    window.open(this.link.url, '_blank', 'noopener')
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
    }

    .card {
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      width: 280px;
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
      z-index: 100;
      overflow: hidden;
      animation: fade-in 0.12s ease;
      pointer-events: auto;
    }

    .card.visible {
      display: block;
    }

    @keyframes fade-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .cover {
      width: 100%;
      height: 120px;
      object-fit: cover;
      display: block;
      background: #141414;
    }

    .body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

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
      padding: 7px 10px;
      font-size: 11px;
      cursor: pointer;
      text-align: center;
      box-sizing: border-box;
    }

    .open-btn:hover,
    .open-btn:active {
      background: #22d3ee14;
    }

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

  private _renderCover(imageUrl: string | undefined): TemplateResult | string {
    if (!imageUrl) return ''
    const hideBrokenImage = (event: Event) => {
      ;(event.target as HTMLElement).style.display = 'none'
    }
    return html`<img class="cover" src="${imageUrl}" alt="" @error=${hideBrokenImage} />`
  }

  private _renderChips(entries: [string, unknown][]): TemplateResult | string {
    if (entries.length === 0) return ''
    const chips = entries.map(([key, value]) => html` <span class="chip">${_label(key)}: ${value}</span> `)
    return html`<div class="chips">${chips}</div>`
  }

  private _renderCard(): TemplateResult {
    const meta = this.link?.meta
    const printSettings = meta?.print_settings
    const printSettingEntries = printSettings ? Object.entries(printSettings).filter(([, value]) => value) : []
    return html`<div class="card ${this._visible ? 'visible' : ''}">
      ${this._renderCover(meta?.image_url)}
      <div class="body">
        ${meta?.title ? html`<div class="title">${meta.title}</div>` : ''}
        ${meta?.description ? html`<div class="desc">${_stripHtml(meta.description)}</div>` : ''}
        ${this._renderChips(printSettingEntries)}
      </div>
      <div class="footer">
        <button class="open-btn" @click=${this._open}>Open link ↗</button>
      </div>
    </div>`
  }

  render() {
    return html`<slot></slot> ${this._hasContent() ? this._renderCard() : ''}`
  }
}

function _stripHtml(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const _LABELS: Record<string, string> = {
  layer_height: 'Layer',
  walls: 'Walls',
  infill: 'Infill',
  nozzle: 'Nozzle',
  material: 'Material',
  printer: 'Printer',
  weight_g: 'Weight',
  parts: 'Parts',
}
function _label(key: string) {
  return _LABELS[key] ?? key
}

declare global {
  interface HTMLElementTagNameMap {
    'link-preview-card': LinkPreviewCard
  }
}
