import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { firmwareRestart, getSpools, powerOn, startPrint } from '../api'
import { renderIcon } from '../icons'
import { sseClient } from '../sse'
import { buildSpoolName } from '../spool-list'
import type { Power, Spool } from '../types'
import '../styles/print-ready.css'

type StopFunction = () => void
type Step = 'confirm' | 'needs-power' | 'waiting-power' | 'needs-firmware' | 'waiting-klippy' | 'error'
type Payload = { type: string; data: unknown }

const RETRY_MILLISECONDS = 5000

function repeatWithInterval(callback: () => void): StopFunction {
  const interval = setInterval(callback, RETRY_MILLISECONDS)
  return () => clearInterval(interval)
}

/** Asks for a last confirmation before a print starts, and helps to get the printer ready when it is not. */
@customElement('print-ready-modal')
export class PrintReadyModal extends LitElement {
  @property({ attribute: false }) loadSpools: () => Promise<Spool[]> = getSpools
  @property({ attribute: false }) requestStart: (filename: string) => Promise<unknown> = startPrint
  @property({ attribute: false }) requestPowerOn: () => Promise<unknown> = powerOn
  @property({ attribute: false }) requestFirmwareRestart: () => Promise<unknown> = firmwareRestart
  @property({ attribute: false }) subscribeToPayloads: (handler: (payload: Payload) => void) => StopFunction = (
    handler,
  ) => sseClient.subscribe(handler)
  @property({ attribute: false }) repeatEvery: (callback: () => void) => StopFunction = repeatWithInterval

  @state() private isOpen = false
  @state() private filename = ''
  @state() private step: Step = 'confirm'
  @state() private isBusy = false
  @state() private power: Power | null = null
  @state() private spoolName = ''

  private stopListening: StopFunction | null = null
  private stopRetrying: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.stopListening = this.subscribeToPayloads((payload) => this.receive(payload))
    document.addEventListener('keydown', this.handleKey)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopListening?.()
    this.stopRetrying?.()
    document.removeEventListener('keydown', this.handleKey)
  }

  private handleKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isOpen) this.close()
  }

  private receive(payload: Payload): void {
    if (payload.type === 'power') this.receivePower(payload.data as Power)
    if (payload.type === 'printer_state' && this.step === 'waiting-klippy') {
      if ((payload.data as { state: string }).state === 'standby') void this.start()
    }
  }

  private receivePower(power: Power): void {
    this.power = power
    const isWaitingForPower = this.step === 'waiting-power' || this.step === 'needs-power'
    if (isWaitingForPower && power.switch === 'on') this.step = 'needs-firmware'
  }

  /** Opens the confirmation for a file. */
  async tryPrint(filename: string): Promise<void> {
    this.filename = filename
    this.step = 'confirm'
    this.isOpen = true
    const spools = await this.loadSpools().catch(() => [])
    const active = spools.find((spool) => spool.active)
    this.spoolName = active ? buildSpoolName(active) : 'No spool in use'
  }

  private close(): void {
    this.stopRetrying?.()
    this.stopRetrying = null
    this.isOpen = false
    this.isBusy = false
  }

  private async start(): Promise<void> {
    if (this.isBusy) return
    this.isBusy = true
    try {
      await this.requestStart(this.filename)
      this.close()
      this.dispatchEvent(new CustomEvent('print-started', { bubbles: true, composed: true }))
    } catch {
      this.isBusy = false
      if (this.step === 'confirm') this.step = this.power?.switch === 'on' ? 'needs-firmware' : 'needs-power'
    }
  }

  private async switchPowerOn(): Promise<void> {
    this.isBusy = true
    try {
      await this.requestPowerOn()
      this.step = 'waiting-power'
    } catch {
      this.step = 'error'
    }
    this.isBusy = false
  }

  private async restartFirmware(): Promise<void> {
    this.isBusy = true
    try {
      await this.requestFirmwareRestart()
      this.step = 'waiting-klippy'
      this.stopRetrying = this.repeatEvery(() => void this.start())
    } catch {
      this.step = 'error'
    }
    this.isBusy = false
  }

  private renderCheck(name: string, text: string): TemplateResult {
    return html`<div class="ready-check" data-check=${name}>
      <span class="ready-check-mark">${renderIcon('play', 12)}</span>${text}
    </div>`
  }

  private renderConfirm(): TemplateResult {
    return html`<div class="ready-body">
        <div class="muted ready-label">File</div>
        <div class="monospace ready-file">${this.filename}</div>
        ${this.renderCheck('spool', `Spool: ${this.spoolName}`)} ${this.renderCheck('bed', 'Bed is clear')}
      </div>
      <div class="ready-footer">
        <button class="button cancel-button" @click=${this.close}>Cancel</button>
        <button class="button primary start-button" @click=${this.start}>Start print</button>
      </div>`
  }

  private renderStepContent(text: string, button: TemplateResult | typeof nothing): TemplateResult {
    return html`<div class="ready-body"><div class="ready-step">${text}</div></div>
      <div class="ready-footer">
        <button class="button cancel-button" @click=${this.close}>Cancel</button>${button}
      </div>`
  }

  private renderStep(): TemplateResult {
    const disabled = this.isBusy
    if (this.step === 'needs-power') {
      return this.renderStepContent(
        'Printer power is off.',
        html`<button class="button primary power-on-button" ?disabled=${disabled} @click=${this.switchPowerOn}>
          Turn on power
        </button>`,
      )
    }
    if (this.step === 'waiting-power') return this.renderStepContent('Waiting for the printer to start…', nothing)
    if (this.step === 'needs-firmware') {
      return this.renderStepContent(
        'Klipper is not connected.',
        html`<button class="button primary restart-button" ?disabled=${disabled} @click=${this.restartFirmware}>
          Restart firmware
        </button>`,
      )
    }
    if (this.step === 'waiting-klippy') return this.renderStepContent('Waiting for Klipper to become ready…', nothing)
    return this.renderStepContent('Could not reach the printer.', nothing)
  }

  render(): TemplateResult | typeof nothing {
    if (!this.isOpen) return nothing
    return html`<div class="ready-overlay" @click=${this.close}>
      <div
        class="ready-dialog"
        role="dialog"
        aria-label="Start print"
        @click=${(event: Event) => event.stopPropagation()}
      >
        <div class="section-header ready-title">Start print</div>
        ${this.step === 'confirm' ? this.renderConfirm() : this.renderStep()}
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'print-ready-modal': PrintReadyModal
  }
}
