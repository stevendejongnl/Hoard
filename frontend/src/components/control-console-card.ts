import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getConsole } from '../api'
import { describeConsoleLine, filterConsoleLines, formatConsoleLine, formatConsoleTime } from '../console-lines'
import type { ConsoleLine } from '../types'
import { ControlCard } from './control-card'

const POLL_MILLISECONDS = 3000
const COPIED_MILLISECONDS = 2000
/** how far from the end of the log still counts as being at the end */
const END_TOLERANCE_PIXELS = 8

/** The console of the printer: its lines with a search, a filter and a way to stop following, and a field to send G-code. */
@customElement('control-console-card')
export class ControlConsoleCard extends ControlCard {
  @property({ attribute: false }) loadLines: () => Promise<ConsoleLine[]> = getConsole
  @property({ attribute: false }) copyText: (text: string) => Promise<void> = (text) =>
    navigator.clipboard.writeText(text)
  @property({ type: Number }) pollMilliseconds = POLL_MILLISECONDS

  @state() private lines: ConsoleLine[] = []
  @state() private draft = ''
  @state() private hasFailed = false
  @state() private query = ''
  @state() private hideTemperatures = true
  @state() private isFollowing = true
  @state() private clearedUntil = 0
  @state() private hasCopied = false

  private poller: ReturnType<typeof setInterval> | undefined

  connectedCallback(): void {
    super.connectedCallback()
    void this.refresh()
    clearInterval(this.poller)
    this.poller = setInterval(() => void this.refresh(), this.pollMilliseconds)
  }

  disconnectedCallback(): void {
    clearInterval(this.poller)
    super.disconnectedCallback()
  }

  protected updated(): void {
    const log = this.querySelector('.control-console-log')
    if (log && this.isFollowing) log.scrollTop = log.scrollHeight
  }

  /** Reads the lines of the printer again. */
  async refresh(): Promise<void> {
    try {
      this.lines = await this.loadLines()
      this.hasFailed = false
    } catch {
      this.hasFailed = true
    }
  }

  private listShown(): ConsoleLine[] {
    return filterConsoleLines(this.lines, {
      query: this.query,
      hideTemperatures: this.hideTemperatures,
      clearedUntil: this.clearedUntil,
    })
  }

  private async sendLine(): Promise<void> {
    const script = this.draft.trim()
    if (!script || this.locked) return
    await this.command('gcode', { script })
    if (this.failure) return
    this.draft = ''
    await this.refresh()
  }

  private clearView(): void {
    this.clearedUntil = Math.max(0, ...this.lines.map((line) => line.time))
  }

  private async copyShown(): Promise<void> {
    await this.copyText(this.listShown().map(formatConsoleLine).join('\n'))
    this.hasCopied = true
    setTimeout(() => (this.hasCopied = false), COPIED_MILLISECONDS)
  }

  private followScroll(event: Event): void {
    const log = event.target as HTMLElement
    this.isFollowing = log.scrollTop + log.clientHeight >= log.scrollHeight - END_TOLERANCE_PIXELS
  }

  private renderFilters(): TemplateResult {
    return html`<input
        type="search"
        data-field="search"
        aria-label="Search the console"
        placeholder="Search"
        autocomplete="off"
        spellcheck="false"
        .value=${this.query}
        @input=${(event: Event) => (this.query = (event.target as HTMLInputElement).value)}
      />
      <label class="control-console-toggle">
        <input
          type="checkbox"
          data-field="hide-temperatures"
          .checked=${this.hideTemperatures}
          @change=${(event: Event) => (this.hideTemperatures = (event.target as HTMLInputElement).checked)}
        />
        Hide temperatures
      </label>`
  }

  private renderActions(): TemplateResult {
    return html`<button
        class="button ${this.isFollowing ? 'active' : ''}"
        aria-label="Follow"
        aria-pressed=${this.isFollowing}
        @click=${() => (this.isFollowing = !this.isFollowing)}
      >
        Follow
      </button>
      <button class="button" aria-label="Copy" @click=${() => void this.copyShown()}>
        ${this.hasCopied ? 'Copied' : 'Copy'}
      </button>
      <button class="button" aria-label="Clear" @click=${() => this.clearView()}>Clear</button>`
  }

  private renderTools(): TemplateResult {
    return html`<div class="control-console-tools">${this.renderFilters()} ${this.renderActions()}</div>`
  }

  private renderLine(line: ConsoleLine): TemplateResult {
    const kind = describeConsoleLine(line)
    return html`<div class="control-console-line ${kind}">
      <span class="control-console-time">${formatConsoleTime(line.time)}</span>
      <span class="control-console-text">${kind === 'command' ? '$ ' : ''}${line.message}</span>
    </div>`
  }

  private renderCount(shown: number): TemplateResult {
    const cleared = this.clearedUntil > 0
    return html`<div class="muted control-console-count">
      ${shown === this.lines.length ? `${shown} lines` : `${shown} of ${this.lines.length} lines`}
      ${cleared
        ? html`·
            <button class="button flat" aria-label="Show all" @click=${() => (this.clearedUntil = 0)}>Show all</button>`
        : ''}
    </div>`
  }

  private renderLog(): TemplateResult {
    if (this.hasFailed) return html`<div class="muted control-empty">Could not read the console</div>`
    const shown = this.listShown()
    return html`<div class="control-console-log" @scroll=${(event: Event) => this.followScroll(event)}>
        ${shown.length === 0 && this.lines.length > 0
          ? html`<div class="muted">No lines match</div>`
          : shown.map((line) => this.renderLine(line))}
      </div>
      ${this.renderCount(shown.length)}`
  }

  private renderInput(): TemplateResult {
    return html`<div class="control-console-input">
      <input
        type="text"
        data-field="gcode"
        aria-label="G-code"
        placeholder="G-code"
        autocomplete="off"
        spellcheck="false"
        ?disabled=${this.locked}
        .value=${this.draft}
        @input=${(event: Event) => (this.draft = (event.target as HTMLInputElement).value)}
        @keydown=${(event: KeyboardEvent) => event.key === 'Enter' && void this.sendLine()}
      />
      <button class="button" ?disabled=${this.locked} @click=${() => void this.sendLine()}>Send</button>
    </div>`
  }

  render(): TemplateResult {
    return this.renderFrame(
      'Console',
      'terminal',
      html`${this.renderTools()} ${this.renderLog()} ${this.renderInput()} ${this.renderLockNote()}`,
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-console-card': ControlConsoleCard
  }
}
