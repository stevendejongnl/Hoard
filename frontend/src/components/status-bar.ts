import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { createAccentTheme, isValidAccentColor } from '../accent-theme'
import type { ConnectionStatus } from '../server-sent-events-client'
import { sseClient } from '../sse'
import { DEFAULT_ACCENT_COLOR, normalizeHexadecimalColor } from '../theme'

type StopFunction = () => void

/** The part of the accent theme the picker uses. */
interface AccentColorSettings {
  readAccentColor(): string
  applyAccentColor(text: string): void
  storeAccentColor(text: string): void
}

const NEVER_CONNECTED: ConnectionStatus = { isConnected: false, lastMessageAt: 0 }
const SECONDS_COUNTED_AS_JUST_NOW = 2

export function describeKlipperState(printerState: string): string {
  if (printerState === '') return 'Klipper state unknown'
  if (printerState === 'error') return 'Klipper error'
  return 'Klipper ready'
}

export function describeFreshness(lastMessageAt: number, now: number): string {
  if (lastMessageAt === 0) return 'Waiting for data'
  const seconds = Math.max(0, Math.round((now - lastMessageAt) / 1000))
  if (seconds < SECONDS_COUNTED_AS_JUST_NOW) return 'Updated just now'
  return `Updated ${seconds} s ago`
}

async function fetchVersion(): Promise<string> {
  const response = await fetch('/api/version')
  if (!response.ok) throw new Error(`Version request failed: ${response.status}`)
  const body = (await response.json()) as { version: string }
  return body.version
}

function repeatEverySecondWithInterval(callback: () => void): StopFunction {
  const interval = setInterval(callback, 1000)
  return () => clearInterval(interval)
}

/** The strip along the bottom of the desktop layout: is data arriving, from what, and how fresh. */
@customElement('status-bar')
export class StatusBar extends LitElement {
  /** the printer state from the stream: printing, paused, error, standby, ... */
  @property({ type: String }) printerState = ''
  @property({ attribute: false }) subscribeToConnectionStatus: (
    handler: (status: ConnectionStatus) => void,
  ) => StopFunction = (handler) => sseClient.subscribeToStatus(handler)
  @property({ attribute: false }) repeatEverySecond: (callback: () => void) => StopFunction =
    repeatEverySecondWithInterval
  @property({ attribute: false }) now: () => number = () => Date.now()
  @property({ attribute: false }) loadVersion: () => Promise<string> = fetchVersion

  /** where the accent color is applied and stored; tests pass a fake */
  @property({ attribute: false }) accentTheme: AccentColorSettings = createAccentTheme({
    storage: window.localStorage,
    rootElement: document.documentElement,
  })

  @state() private isPickerOpen = false
  @state() private accentDraft = ''
  @state() private hasAccentError = false
  @state() private connectionStatus: ConnectionStatus = NEVER_CONNECTED
  @state() private currentTime = 0
  @state() private version = ''

  private stopListening: StopFunction | null = null
  private stopTicking: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.currentTime = this.now()
    this.stopListening = this.subscribeToConnectionStatus((status) => (this.connectionStatus = status))
    this.stopTicking = this.repeatEverySecond(() => (this.currentTime = this.now()))
    void this.loadAndShowVersion()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopListening?.()
    this.stopTicking?.()
  }

  private async loadAndShowVersion(): Promise<void> {
    try {
      this.version = await this.loadVersion()
    } catch {
      this.version = ''
    }
  }

  private renderConnection(): TemplateResult {
    const isConnected = this.connectionStatus.isConnected
    return html`<span class="status-item"
      ><span class="connection-light ${isConnected ? '' : 'disconnected'}"></span>${isConnected
        ? 'Connected'
        : 'Disconnected'}</span
    >`
  }

  private openPicker(): void {
    this.accentDraft = this.accentTheme.readAccentColor()
    this.hasAccentError = false
    this.isPickerOpen = true
  }

  private closePicker(): void {
    this.isPickerOpen = false
  }

  private togglePicker(): void {
    if (this.isPickerOpen) {
      this.closePicker()
      return
    }
    this.openPicker()
  }

  private changeAccentColor(text: string): void {
    this.accentDraft = text
    this.hasAccentError = !isValidAccentColor(text)
    if (this.hasAccentError) return
    this.accentTheme.applyAccentColor(text)
    this.accentTheme.storeAccentColor(text)
  }

  private renderPicker(): TemplateResult | typeof nothing {
    if (!this.isPickerOpen) return nothing
    const colorInputValue = normalizeHexadecimalColor(this.accentDraft) ?? this.accentTheme.readAccentColor()
    return html`<div class="appearance-popover" id="appearance-popover" role="dialog" aria-label="Appearance">
      <span class="muted">Accent color (hex)</span>
      <div class="appearance-row">
        <input
          class="accent-color"
          type="color"
          aria-label="Pick accent color"
          .value=${colorInputValue}
          @input=${(event: Event) => this.changeAccentColor((event.target as HTMLInputElement).value)}
        />
        <input
          class="accent-text"
          aria-label="Accent color hex"
          maxlength="7"
          spellcheck="false"
          .value=${this.accentDraft}
          @input=${(event: Event) => this.changeAccentColor((event.target as HTMLInputElement).value)}
        />
      </div>
      ${this.hasAccentError ? html`<span class="appearance-error">Use a hex color like #f45bcb</span>` : nothing}
      <div class="appearance-row">
        <button class="button small accent-reset" @click=${() => this.changeAccentColor(DEFAULT_ACCENT_COLOR)}>
          Reset
        </button>
        <button class="button small primary appearance-done" @click=${() => this.closePicker()}>Done</button>
      </div>
    </div>`
  }

  render(): TemplateResult {
    return html`<footer class="status-bar">
        ${this.renderConnection()}
        <span>${describeKlipperState(this.printerState)}</span>
        <span>${describeFreshness(this.connectionStatus.lastMessageAt, this.currentTime)}</span>
        <button
          class="status-bar-version"
          aria-expanded=${this.isPickerOpen ? 'true' : 'false'}
          aria-controls="appearance-popover"
          @click=${() => this.togglePicker()}
        >
          ${this.version ? `v${this.version}` : 'Appearance'}
        </button>
      </footer>
      ${this.renderPicker()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'status-bar': StatusBar
  }
}
