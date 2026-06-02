import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'

@customElement('top-nav')
export class TopNav extends LitElement {
  @property({ type: Boolean }) printing: boolean = false

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
    }

    .app-name .muted {
      color: var(--text-muted);
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
  `

  render() {
    return html`
      <div class="topbar">
        <span class="app-name">printer<span class="muted">.madebysteven.nl</span></span>
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
