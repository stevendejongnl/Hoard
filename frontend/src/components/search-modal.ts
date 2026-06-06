import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { router } from '../router'

interface SearchResult {
  type: 'history' | 'spool' | 'project'
  id: string | number
  label: string
  sub?: string
  badge?: string
}

@customElement('search-modal')
export class SearchModal extends LitElement {
  @state() private _open = false
  @state() private _query = ''
  @state() private _results: SearchResult[] = []
  @state() private _cursor = 0
  @state() private _loading = false

  private _debounce = 0

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener('keydown', this._onGlobalKey)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('keydown', this._onGlobalKey)
  }

  private _onGlobalKey = (e: KeyboardEvent) => {
    // Open on '/' unless focus is in an input/textarea
    const tag = (e.target as HTMLElement)?.tagName
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault()
      this._openModal()
      return
    }
    if (e.key === 'Escape' && this._open) {
      this._close()
    }
  }

  open() {
    this._openModal()
  }

  private _openModal() {
    this._open = true
    this._query = ''
    this._results = []
    this._cursor = 0
    this.updateComplete.then(() => {
      this.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus()
    })
  }

  private _close() {
    this._open = false
    this._query = ''
    this._results = []
  }

  private _onInput(e: Event) {
    this._query = (e.target as HTMLInputElement).value
    this._cursor = 0
    clearTimeout(this._debounce)
    if (!this._query.trim()) {
      this._results = []
      return
    }
    this._debounce = window.setTimeout(() => this._search(), 200)
  }

  private _onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this._cursor = Math.min(this._cursor + 1, this._results.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      this._cursor = Math.max(this._cursor - 1, 0)
    } else if (e.key === 'Enter' && this._results[this._cursor]) {
      this._select(this._results[this._cursor])
    }
  }

  private _parseQuery(): { scope: string; q: string } {
    const raw = this._query.trim()
    if (raw.startsWith('!h ')) return { scope: 'h', q: raw.slice(3) }
    if (raw.startsWith('!s ')) return { scope: 's', q: raw.slice(3) }
    if (raw.startsWith('!p ')) return { scope: 'p', q: raw.slice(3) }
    // bare prefix without space = still all until space is typed
    if (/^![hsp]$/.test(raw)) return { scope: 'all', q: '' }
    return { scope: 'all', q: raw }
  }

  private async _search() {
    const { scope, q } = this._parseQuery()
    if (!q) {
      this._results = []
      return
    }
    this._loading = true
    try {
      const params = new URLSearchParams({ q, ...(scope !== 'all' ? { scope } : {}) })
      const r = await fetch(`/api/search?${params}`)
      const data = await r.json()
      const results: SearchResult[] = []

      for (const p of data.projects ?? []) {
        results.push({ type: 'project', id: p.id, label: p.name, sub: `${p.print_count} prints`, badge: 'project' })
      }
      for (const s of data.spools ?? []) {
        results.push({
          type: 'spool',
          id: s.id,
          label: `${s.brand} ${s.material}`,
          sub: s.color,
          badge: 'spool',
        })
      }
      for (const h of data.history ?? []) {
        const d = new Date((h.time ?? 0) * 1000)
        const date = h.time ? d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''
        results.push({ type: 'history', id: h.job_id, label: h.filename, sub: date, badge: 'print' })
      }
      this._results = results
      this._cursor = 0
    } catch {
      this._results = []
    } finally {
      this._loading = false
    }
  }

  private _select(r: SearchResult) {
    this._close()
    if (r.type === 'project') {
      router.navigate(`/projects/${String(r.id)}`)
    } else if (r.type === 'spool') {
      router.navigate('/spools')
    } else if (r.type === 'history') {
      router.navigate('/history')
    }
  }

  static styles = css`
    :host {
      display: contents;
    }

    .overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 200;
      align-items: flex-start;
      justify-content: center;
      padding-top: 80px;
    }
    .overlay.open {
      display: flex;
    }

    .box {
      width: min(560px, calc(100vw - 32px));
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 10px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
      overflow: hidden;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-bottom: 1px solid #222;
    }

    .search-icon {
      color: #555;
      font-size: 14px;
      flex-shrink: 0;
    }

    input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #e0e0e0;
      font-size: 14px;
      font-family: inherit;
    }
    input::placeholder {
      color: #444;
    }

    .hint {
      font-size: 10px;
      color: #333;
      flex-shrink: 0;
    }

    .results {
      max-height: 360px;
      overflow-y: auto;
    }

    .result {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      cursor: pointer;
      border-bottom: 1px solid #1e1e1e;
    }
    .result:last-child {
      border-bottom: none;
    }
    .result:hover,
    .result.active {
      background: #222;
    }

    .badge {
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border-radius: 3px;
      padding: 2px 5px;
      flex-shrink: 0;
      width: 38px;
      text-align: center;
    }
    .badge.project {
      background: #22d3ee14;
      color: #22d3ee;
      border: 1px solid #22d3ee28;
    }
    .badge.spool {
      background: #a78bfa14;
      color: #a78bfa;
      border: 1px solid #a78bfa28;
    }
    .badge.print {
      background: #34d39914;
      color: #34d399;
      border: 1px solid #34d39928;
    }

    .label {
      font-size: 13px;
      color: #e0e0e0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sub {
      font-size: 11px;
      color: #555;
      flex-shrink: 0;
    }

    .empty {
      padding: 20px 16px;
      text-align: center;
      font-size: 12px;
      color: #444;
    }

    .prefixes {
      padding: 10px 16px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      border-top: 1px solid #1e1e1e;
    }
    .prefix-tag {
      font-size: 10px;
      color: #555;
      background: #141414;
      border: 1px solid #222;
      border-radius: 3px;
      padding: 2px 6px;
    }
    .prefix-tag span {
      color: #22d3ee;
    }
  `

  render() {
    const { scope } = this._parseQuery()
    const hasQuery = !!this._query.trim()

    return html`
      <div
        class="overlay ${this._open ? 'open' : ''}"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this._close()
        }}
      >
        <div class="box">
          <div class="input-row">
            <span class="search-icon">⌕</span>
            <input
              type="text"
              placeholder="Search… (try !p, !h, !s)"
              .value=${this._query}
              @input=${this._onInput}
              @keydown=${this._onKeydown}
            />
            <span class="hint">esc to close</span>
          </div>

          ${hasQuery
            ? html`
                <div class="results">
                  ${this._loading
                    ? html`<div class="empty">Searching…</div>`
                    : this._results.length === 0
                      ? html`<div class="empty">No results for "${this._query}"</div>`
                      : this._results.map(
                          (r, i) => html`
                            <div
                              class="result ${i === this._cursor ? 'active' : ''}"
                              @click=${() => this._select(r)}
                              @mouseover=${() => {
                                this._cursor = i
                              }}
                            >
                              <span class="badge ${r.badge ?? ''}">${r.badge}</span>
                              <span class="label">${r.label}</span>
                              ${r.sub ? html`<span class="sub">${r.sub}</span>` : ''}
                            </div>
                          `,
                        )}
                </div>
              `
            : html`
                <div class="prefixes">
                  <span class="prefix-tag"><span>!p</span> projects</span>
                  <span class="prefix-tag"><span>!h</span> history</span>
                  <span class="prefix-tag"><span>!s</span> spools</span>
                </div>
              `}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'search-modal': SearchModal
  }
}
