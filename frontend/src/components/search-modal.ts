import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { renderIcon } from '../icons'
import { router } from '../router'
import { buildSearchGroups, findSearchResultPath, parseSearchQuery } from '../search-results'
import type { SearchGroup, SearchPayload, SearchScope } from '../search-results'
import '../styles/search.css'

type SearchState = 'idle' | 'found' | 'empty' | 'failed'

const HINT = 'Type to search prints, projects and spools. Narrow with !h prints, !p projects, !s spools.'

async function searchOnServer(text: string, scope: SearchScope): Promise<SearchPayload> {
  const parameters = new URLSearchParams({ q: text, ...(scope === 'all' ? {} : { scope }) })
  const response = await fetch(`/api/search?${parameters}`)
  if (!response.ok) throw new Error(`Search failed: ${response.status}`)
  return response.json()
}

/** A command palette: type, see prints, projects and spools grouped, press Enter on one. */
@customElement('search-modal')
export class SearchModal extends LitElement {
  @property({ attribute: false }) runSearch: (text: string, scope: SearchScope) => Promise<SearchPayload> =
    searchOnServer
  @property({ attribute: false }) navigate: (path: string) => void = (path) =>
    router.navigate(path as Parameters<typeof router.navigate>[0])
  @property({ type: Number }) debounceMilliseconds = 200

  @state() private isOpen = false
  @state() private query = ''
  @state() private groups: SearchGroup[] = []
  @state() private searchState: SearchState = 'idle'
  @state() private cursor = 0

  private debounceTimer = 0

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('keydown', this.handleGlobalKey)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('keydown', this.handleGlobalKey)
    clearTimeout(this.debounceTimer)
  }

  private handleGlobalKey = (event: KeyboardEvent): void => {
    const tag = (event.target as HTMLElement | null)?.tagName
    if (event.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      event.preventDefault()
      this.open()
    }
    if (event.key === 'Escape' && this.isOpen) this.close()
  }

  open(): void {
    this.isOpen = true
    this.query = ''
    this.groups = []
    this.searchState = 'idle'
    this.cursor = 0
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>('input.search-input')?.focus())
  }

  private close(): void {
    this.isOpen = false
    this.query = ''
    this.groups = []
  }

  private changeQuery(event: Event): void {
    this.query = (event.target as HTMLInputElement).value
    this.cursor = 0
    clearTimeout(this.debounceTimer)
    if (parseSearchQuery(this.query).text === '') {
      this.groups = []
      this.searchState = 'idle'
      return
    }
    this.debounceTimer = window.setTimeout(() => void this.search(), this.debounceMilliseconds)
  }

  private async search(): Promise<void> {
    const { text, scope } = parseSearchQuery(this.query)
    try {
      this.groups = buildSearchGroups(await this.runSearch(text, scope))
      this.searchState = this.groups.length > 0 ? 'found' : 'empty'
    } catch {
      this.groups = []
      this.searchState = 'failed'
    }
  }

  private countResults(): number {
    return this.groups.reduce((total, group) => total + group.results.length, 0)
  }

  private choosePath(path: string | null): void {
    if (path === null) return
    this.close()
    this.navigate(path)
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.cursor = Math.min(this.cursor + 1, this.countResults() - 1)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.cursor = Math.max(this.cursor - 1, 0)
    }
    if (event.key === 'Enter') this.choosePath(findSearchResultPath(this.groups, this.cursor))
  }

  private renderResults(): TemplateResult {
    let position = -1
    return html`${this.groups.map(
      (group) =>
        html`<div class="search-group">
          <div class="search-group-title">${group.title}</div>
          ${group.results.map((result) => {
            position += 1
            const isCursor = position === this.cursor
            return html`<div
              class="search-result ${isCursor ? 'cursor' : ''}"
              @click=${() => this.choosePath(result.path)}
            >
              <span class="search-result-label">${result.label}</span
              ><span class="muted search-result-detail">${result.detail}</span>
            </div>`
          })}
        </div>`,
    )}`
  }

  private describeHint(): string {
    if (this.searchState === 'empty') return `No results for "${parseSearchQuery(this.query).text}"`
    if (this.searchState === 'failed') return 'Search is not available right now'
    return HINT
  }

  private renderBody(): TemplateResult {
    if (this.searchState === 'found') return this.renderResults()
    return html`<div class="search-hint">${this.describeHint()}</div>`
  }

  render(): TemplateResult | typeof nothing {
    return html`<div class="search-overlay ${this.isOpen ? 'open' : ''}" @click=${this.close}>
      <div class="search-box" role="dialog" aria-label="Search" @click=${(event: Event) => event.stopPropagation()}>
        <div class="search-input-row">
          ${renderIcon('search', 16)}
          <input
            class="search-input"
            type="text"
            placeholder="Search prints, projects and spools"
            aria-label="Search"
            .value=${this.query}
            @input=${this.changeQuery}
            @keydown=${this.handleKey}
          />
          <span class="monospace muted search-escape">Esc</span>
        </div>
        <div class="search-body">${this.renderBody()}</div>
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'search-modal': SearchModal
  }
}
