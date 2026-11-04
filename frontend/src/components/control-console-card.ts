import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getConsole } from '../api'
import type { ConsoleLine } from '../types'
import { ControlCard } from './control-card'

/** The console of the printer: its lines, and a field to send a line of G-code. */
@customElement('control-console-card')
export class ControlConsoleCard extends ControlCard {
  @property({ attribute: false }) loadLines: () => Promise<ConsoleLine[]> = getConsole

  @state() private lines: ConsoleLine[] = []
  @state() private draft = ''
  @state() private hasFailed = false

  connectedCallback(): void {
    super.connectedCallback()
    void this.load()
  }

  protected updated(): void {
    const log = this.querySelector('.control-console-log')
    if (log) log.scrollTop = log.scrollHeight
  }

  private async load(): Promise<void> {
    try {
      this.lines = await this.loadLines()
      this.hasFailed = false
    } catch {
      this.hasFailed = true
    }
  }

  private async sendLine(): Promise<void> {
    const script = this.draft.trim()
    if (!script || this.locked) return
    await this.command('gcode', { script })
    if (this.failure) return
    this.draft = ''
    await this.load()
  }

  private renderLog(): TemplateResult {
    if (this.hasFailed) return html`<div class="muted control-empty">Could not read the console</div>`
    return html`<div class="control-console-log">
      ${this.lines.map(
        (line) =>
          html`<div class="control-console-line ${line.type}">
            ${line.type === 'command' ? '> ' : ''}${line.message}
          </div>`,
      )}
    </div>`
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
      html`${this.renderLog()} ${this.renderInput()} ${this.renderLockNote()}`,
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-console-card': ControlConsoleCard
  }
}
