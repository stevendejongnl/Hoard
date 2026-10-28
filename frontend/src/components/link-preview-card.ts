import { LitElement, html, css } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { ProjectLink } from '../types'

const SHOW_DELAY_MILLISECONDS = 120
const HIDE_DELAY_MILLISECONDS = 150

@customElement('link-preview-card')
export class LinkPreviewCard extends LitElement {
  @property({ type: Object }) link!: ProjectLink
  @state() private isVisible = false
  private showTimer = 0
  private hideTimer = 0

  /** Replaceable so tests, and browsers without media queries, decide what counts as a touch screen. */
  @property({ attribute: false }) isTouchScreen: () => boolean = () =>
    window.matchMedia?.('(hover: none)').matches ?? false
  @property({ attribute: false }) scheduleTimer: (callback: () => void, milliseconds: number) => number = (
    callback,
    milliseconds,
  ) => window.setTimeout(callback, milliseconds)
  @property({ attribute: false }) cancelTimer: (handle: number) => void = (handle) => window.clearTimeout(handle)
  @property({ attribute: false }) openLink: (url: string) => void = (url) => {
    window.open(url, '_blank', 'noopener')
  }
  /** Where a tap outside the card is heard, so the preview can close. */
  @property({ attribute: false }) outsideClickTarget: EventTarget = document

  private hasContent(): boolean {
    return !!(this.link?.meta?.title || this.link?.meta?.image_url)
  }

  // All events on the host element — avoids Shadow DOM / slotted-content event issues
  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('mouseenter', this.handleEnter)
    this.addEventListener('mouseleave', this.handleLeave)
    this.addEventListener('click', this.handleClick, true)
    this.listeningTarget = this.outsideClickTarget
    this.listeningTarget.addEventListener('click', this.handleOutsideClick, true)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('mouseenter', this.handleEnter)
    this.removeEventListener('mouseleave', this.handleLeave)
    this.removeEventListener('click', this.handleClick, true)
    this.listeningTarget?.removeEventListener('click', this.handleOutsideClick, true)
  }

  private listeningTarget: EventTarget | null = null

  private handleOutsideClick = (event: Event) => {
    if (!this.isVisible) return
    if (!this.isTouchScreen()) return // desktop uses mouseleave to hide
    if (event.target instanceof Node && this.contains(event.target)) return
    this.isVisible = false
  }

  private handleEnter = () => {
    if (this.isTouchScreen()) return
    this.cancelTimer(this.hideTimer)
    this.showTimer = this.scheduleTimer(() => {
      this.isVisible = true
    }, SHOW_DELAY_MILLISECONDS)
  }

  private handleLeave = () => {
    if (this.isTouchScreen()) return
    this.cancelTimer(this.showTimer)
    this.hideTimer = this.scheduleTimer(() => {
      this.isVisible = false
    }, HIDE_DELAY_MILLISECONDS)
  }

  private handleClick = (event: Event) => {
    if (!this.isTouchScreen()) return // desktop: don't intercept, let <a> navigate
    if (!this.hasContent()) return // nothing to show, let <a> navigate
    if (event.composedPath().some((target) => target instanceof Element && target.classList.contains('card'))) return // click inside popup card
    event.preventDefault()
    event.stopImmediatePropagation()
    this.isVisible = !this.isVisible
  }

  private openLinkAndHide(event: Event) {
    event.stopPropagation()
    this.isVisible = false
    this.openLink(this.link.url)
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

    .description {
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

    .open-button {
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

    .open-button:hover,
    .open-button:active {
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

  private renderCover(imageUrl: string | undefined): TemplateResult | string {
    if (!imageUrl) return ''
    const hideBrokenImage = (event: Event) => {
      ;(event.target as HTMLElement).style.display = 'none'
    }
    return html`<img class="cover" src="${imageUrl}" alt="" @error=${hideBrokenImage} />`
  }

  private renderChips(entries: [string, unknown][]): TemplateResult | string {
    if (entries.length === 0) return ''
    const chips = entries.map(([key, value]) => html` <span class="chip">${labelOf(key)}: ${value}</span> `)
    return html`<div class="chips">${chips}</div>`
  }

  private renderCard(): TemplateResult {
    const metadata = this.link?.meta
    const printSettings = metadata?.print_settings
    const printSettingEntries = printSettings ? Object.entries(printSettings).filter(([, value]) => value) : []
    return html`<div class="card ${this.isVisible ? 'visible' : ''}">
      ${this.renderCover(metadata?.image_url)}
      <div class="body">
        ${metadata?.title ? html`<div class="title">${metadata.title}</div>` : ''}
        ${metadata?.description ? html`<div class="description">${stripHtml(metadata.description)}</div>` : ''}
        ${this.renderChips(printSettingEntries)}
      </div>
      <div class="footer">
        <button class="open-button" @click=${this.openLinkAndHide}>Open link ↗</button>
      </div>
    </div>`
  }

  render() {
    return html`<slot></slot> ${this.hasContent() ? this.renderCard() : ''}`
  }
}

function stripHtml(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const LABELS: Record<string, string> = {
  layer_height: 'Layer',
  walls: 'Walls',
  infill: 'Infill',
  nozzle: 'Nozzle',
  material: 'Material',
  printer: 'Printer',
  weight_g: 'Weight',
  parts: 'Parts',
}
function labelOf(key: string) {
  return LABELS[key] ?? key
}

declare global {
  interface HTMLElementTagNameMap {
    'link-preview-card': LinkPreviewCard
  }
}
