import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

@customElement('top-nav')
export class TopNav extends LitElement {
  @property({ type: Boolean }) printing: boolean = false
  @state() private _version = ''

  async connectedCallback() {
    super.connectedCallback()
    try {
      const r = await fetch('/api/version')
      if (r.ok) {
        const data = await r.json() as { version: string }
        this._version = data.version
      }
    } catch { /* version display is non-critical */ }
  }

  static styles = css`
    :host {
      display: block;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 28px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-deep);
      position: sticky;
      top: 0;
      z-index: 5;
    }

    .app-name {
      font-size: 15px;
      font-weight: 300;
      color: white;
      cursor: pointer;
      user-select: none;
    }

    .app-name:hover .muted {
      color: var(--text);
    }

    .app-name .muted {
      color: var(--text-muted);
      transition: color 0.15s;
    }

    .version-badge {
      font-size: 9px;
      color: var(--text-dim, #333);
      border: 1px solid var(--border, #222);
      border-radius: 3px;
      padding: 1px 5px;
      margin-left: 8px;
      font-weight: 400;
      vertical-align: middle;
      letter-spacing: 0.02em;
    }

    .nav {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .nav-link {
      font-size: 11px;
      color: var(--text-muted);
      cursor: pointer;
    }

    .nav-link:hover {
      color: var(--text);
    }

    .status-badge {
      background: var(--cyan-dim);
      color: var(--cyan);
      border: 1px solid var(--cyan-border);
      border-radius: 20px;
      padding: 3px 10px;
      font-size: 10px;
    }

    .status-badge .dot {
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%   { opacity: 1; }
      50%  { opacity: 0.4; }
      100% { opacity: 1; }
    }

    @media (max-width: 600px) {
      .topbar { padding: 12px 16px; }
      .app-name { font-size: 13px; }
      .nav-link { font-size: 10px; }
      .nav { gap: 12px; }
    }
  `

  render() {
    return html`
      <div class="topbar">
        <span class="app-name" @click=${() => window.router.navigate('/')}>
          printer<span class="muted">.madebysteven.nl</span>${this._version ? html`<span class="version-badge">v${this._version}</span>` : ''}
        </span>
        <div class="nav">
          <span class="nav-link" @click=${() => window.router.navigate('/history')}>history</span>
          <span class="nav-link" @click=${() => window.router.navigate('/spools')}>spools</span>
          ${this.printing
            ? html`<span class="status-badge"><span class="dot">●</span> printing</span>`
            : ''}
        </div>
      </div>
    `
  }
}
