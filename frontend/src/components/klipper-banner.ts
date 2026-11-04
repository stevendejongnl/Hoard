import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { firmwareRestart, getKlipperState, restartKlipper } from '../api'
import { renderIcon } from '../icons'
import type { KlipperState } from '../types'
import '../styles/klipper-banner.css'

type StopFunction = () => void

const READY = 'ready'
const ALARM_STATES = ['shutdown', 'error']
const REFRESH_MILLISECONDS = 5000
const FAILURE = 'Could not send the command'
const STATE_WORDS: Record<string, string> = {
  shutdown: 'Klipper shutdown',
  error: 'Klipper error',
  startup: 'Klipper starting',
  disconnected: 'Klipper disconnected',
}
const LOGS = [
  { file: 'klippy.log', path: '/api/control/logs/klippy' },
  { file: 'moonraker.log', path: '/api/control/logs/moonraker' },
]

function repeatWithInterval(callback: () => void): StopFunction {
  const timer = setInterval(callback, REFRESH_MILLISECONDS)
  return () => clearInterval(timer)
}

function describeState(state: string): string {
  return STATE_WORDS[state] ?? `Klipper ${state}`
}

function readFirstLine(message: string): string {
  return message.split('\n')[0].trim()
}

/**
 * A slim strip under the top bar while Klipper is not ready: what it says, the two restarts, and its logs.
 * It stays away while the printer host cannot be reached, because then the printer is most likely switched off.
 */
@customElement('klipper-banner')
export class KlipperBanner extends LitElement {
  @property({ attribute: false }) loadState: () => Promise<KlipperState> = getKlipperState
  @property({ attribute: false }) restartKlipper: () => Promise<unknown> = restartKlipper
  @property({ attribute: false }) restartFirmware: () => Promise<unknown> = () => firmwareRestart()
  @property({ attribute: false }) repeatEvery: (callback: () => void) => StopFunction = repeatWithInterval

  @state() private klipper: KlipperState | null = null
  @state() private isOpen = false
  @state() private isSending = false
  @state() private hasFailed = false

  private stopRepeating: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.refresh()
    this.stopRepeating = this.repeatEvery(() => void this.refresh())
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopRepeating?.()
  }

  private async refresh(): Promise<void> {
    try {
      this.klipper = await this.loadState()
    } catch {
      this.klipper = null
    }
  }

  private async restart(action: () => Promise<unknown>): Promise<void> {
    this.isSending = true
    this.hasFailed = false
    try {
      await action()
    } catch {
      this.hasFailed = true
    }
    this.isSending = false
    await this.refresh()
  }

  private renderActions(): TemplateResult {
    return html`<span class="klipper-banner-actions">
      <button class="button" ?disabled=${this.isSending} @click=${() => void this.restart(this.restartKlipper)}>
        Restart Klipper
      </button>
      <button class="button" ?disabled=${this.isSending} @click=${() => void this.restart(this.restartFirmware)}>
        Firmware restart
      </button>
    </span>`
  }

  private renderDetails(klipper: KlipperState): TemplateResult | typeof nothing {
    if (!this.isOpen) return nothing
    return html`<div class="klipper-banner-details">
      ${klipper.message ? html`<pre class="klipper-banner-message">${klipper.message}</pre>` : nothing}
      <span class="klipper-banner-logs">
        ${LOGS.map(
          (log) => html`<a class="button" href=${log.path} download>${renderIcon('download', 14)}${log.file}</a>`,
        )}
      </span>
    </div>`
  }

  private renderMain(klipper: KlipperState): TemplateResult {
    const firstLine = readFirstLine(klipper.message)
    return html`<div class="klipper-banner-main">
      <button
        class="klipper-banner-toggle"
        aria-expanded=${this.isOpen ? 'true' : 'false'}
        aria-label=${this.isOpen ? 'Hide details' : 'Show details'}
        @click=${() => (this.isOpen = !this.isOpen)}
      >
        <span class="klipper-banner-dot" aria-hidden="true"></span>
        <span class="klipper-banner-text"
          ><strong>${describeState(klipper.state)}</strong>${firstLine
            ? html`<span>${firstLine}</span>`
            : nothing}</span
        >
        ${renderIcon(this.isOpen ? 'chevron-down' : 'chevron-right', 14, 2.4)}
      </button>
      ${this.renderActions()}
    </div>`
  }

  render(): TemplateResult | typeof nothing {
    const klipper = this.klipper
    if (!klipper || klipper.state === READY) return nothing
    const alarm = ALARM_STATES.includes(klipper.state)
    return html`<div class="klipper-banner ${alarm ? 'alarm' : ''}" role=${alarm ? 'alert' : 'status'}>
      ${this.renderMain(klipper)} ${this.renderDetails(klipper)}
      ${this.hasFailed ? html`<div class="klipper-banner-failure">${FAILURE}</div>` : nothing}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'klipper-banner': KlipperBanner
  }
}
