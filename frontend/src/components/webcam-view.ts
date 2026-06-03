import { LitElement, css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { getWebcams, type Webcam } from '../api'

// iOS Safari doesn't support MJPEG streams in <img> — detect and fall back to snapshot polling
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream

@customElement('webcam-view')
export class WebcamView extends LitElement {
  @state() private cams: Webcam[] = []
  @state() private active = 0
  @state() private expanded = false
  @state() private loading = true
  @state() private imgError = false
  @state() private _useSnapshot = IS_IOS
  @state() private _snapshotSrc = ''

  private _snapshotInterval: ReturnType<typeof setInterval> | null = null

  static styles = css`
    :host { display: block; }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 18px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius, 8px);
      cursor: pointer;
      user-select: none;
      transition: border-color 0.15s;
    }

    .header:hover { border-color: #333; }

    .header.open {
      border-radius: var(--radius, 8px) var(--radius, 8px) 0 0;
      border-bottom-color: var(--border-sub);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: var(--text-muted);
    }

    .cam-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-dim);
    }

    .cam-dot.live {
      background: var(--cyan);
      box-shadow: 0 0 4px var(--cyan);
    }

    .cam-name { color: var(--text); }

    .cam-tabs {
      display: flex;
      gap: 6px;
    }

    .cam-tab {
      font-size: 9px;
      padding: 2px 8px;
      border-radius: 3px;
      border: 1px solid var(--border);
      color: var(--text-muted);
      cursor: pointer;
      background: transparent;
    }

    .cam-tab.active {
      border-color: var(--cyan-border);
      color: var(--cyan);
      background: var(--cyan-dim);
    }

    .chevron {
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.2s;
    }

    .chevron.open { transform: rotate(180deg); }

    .stream-wrap {
      background: #000;
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--radius, 8px) var(--radius, 8px);
      overflow: hidden;
      position: relative;
    }

    .stream-img {
      width: 100%;
      display: block;
      aspect-ratio: 4/3;
      object-fit: contain;
    }

    .stream-error {
      aspect-ratio: 4/3;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-dim);
      font-size: 11px;
    }

    .cam-label {
      position: absolute;
      top: 10px;
      left: 10px;
      font-size: 9px;
      color: rgba(255,255,255,0.4);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      pointer-events: none;
    }
  `

  async connectedCallback() {
    super.connectedCallback()
    try {
      this.cams = await getWebcams()
    } catch {
      this.cams = []
    }
    this.loading = false
    // Start snapshot polling immediately if on iOS
    if (IS_IOS && this.expanded) this._startSnapshotPolling()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._stopSnapshotPolling()
  }

  private _startSnapshotPolling() {
    if (this._snapshotInterval) return
    const cam = this.cams[this.active]
    if (!cam?.snapshot_url) { this.imgError = true; return }
    this._useSnapshot = true
    const fps = cam.target_fps ?? 5
    this._snapshotSrc = `${cam.snapshot_url}?t=${Date.now()}`
    this._snapshotInterval = setInterval(() => {
      this._snapshotSrc = `${cam.snapshot_url}?t=${Date.now()}`
    }, Math.max(200, 1000 / fps))
  }

  private _stopSnapshotPolling() {
    if (this._snapshotInterval) {
      clearInterval(this._snapshotInterval)
      this._snapshotInterval = null
    }
  }

  private _onStreamError() {
    if (!this._useSnapshot && this.cams[this.active]?.snapshot_url) {
      // MJPEG failed — fall back to snapshot polling
      this._startSnapshotPolling()
    } else {
      this.imgError = true
    }
  }

  private _toggle() {
    this.expanded = !this.expanded
    this.imgError = false
    if (!this.expanded) {
      this._stopSnapshotPolling()
      if (IS_IOS) this._useSnapshot = true // reset for next open
    } else {
      if (IS_IOS) this._startSnapshotPolling()
    }
  }

  private _switchCam(i: number) {
    this._stopSnapshotPolling()
    this.active = i
    this.imgError = false
    this._useSnapshot = IS_IOS
    if (IS_IOS && this.expanded) this._startSnapshotPolling()
  }

  private _transform(cam: Webcam): string {
    const parts: string[] = []
    if (cam.flip_horizontal) parts.push('scaleX(-1)')
    if (cam.flip_vertical) parts.push('scaleY(-1)')
    if (cam.rotation) parts.push(`rotate(${cam.rotation}deg)`)
    return parts.join(' ') || 'none'
  }

  render() {
    if (this.loading || this.cams.length === 0) return html``

    const cam = this.cams[this.active]
    const src = this._useSnapshot ? this._snapshotSrc : cam.stream_url

    return html`
      <div
        class="header ${this.expanded ? 'open' : ''}"
        @click=${this._toggle}
      >
        <div class="header-left">
          <div class="cam-dot ${this.expanded ? 'live' : ''}"></div>
          <span class="cam-name">${cam.name}</span>
          <span>${cam.aspect_ratio} · ${cam.target_fps ?? 15} fps</span>
        </div>

        <div style="display:flex;align-items:center;gap:10px" @click=${(e: Event) => e.stopPropagation()}>
          ${this.cams.length > 1 ? html`
            <div class="cam-tabs">
              ${this.cams.map((c, i) => html`
                <button
                  class="cam-tab ${i === this.active ? 'active' : ''}"
                  @click=${() => this._switchCam(i)}
                >${c.name}</button>
              `)}
            </div>
          ` : ''}
          <span class="chevron ${this.expanded ? 'open' : ''}">▾</span>
        </div>
      </div>

      ${this.expanded ? html`
        <div class="stream-wrap">
          <span class="cam-label">${cam.name}</span>
          ${this.imgError ? html`
            <div class="stream-error">stream unavailable</div>
          ` : html`
            <img
              class="stream-img"
              src=${src}
              style="transform: ${this._transform(cam)}"
              @error=${this._onStreamError}
            />
          `}
        </div>
      ` : ''}
    `
  }
}
