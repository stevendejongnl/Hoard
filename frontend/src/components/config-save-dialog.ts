import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { HttpError, firmwareRestart, getKlipperState, getPendingConfig, saveConfig } from '../api'
import { followRestart, MINIMUM_RESTART_MILLISECONDS } from '../config-save-progress'
import type { RestartProgress } from '../config-save-progress'
import { HoldGesture, startBrowserTimer } from '../hold-gesture'
import type { StartTimer } from '../hold-gesture'
import { renderIcon } from '../icons'
import '../styles/control.css'
import type { KlipperState, PendingConfig } from '../types'

const HOLD_MILLISECONDS = 1000
const GENERAL_FAILURE = 'Could not save the config'
const RESTART_WARNING = 'The printer is unavailable for a short time and the heaters switch off.'

type Phase = 'loading' | 'unavailable' | 'nothing' | 'confirm' | 'saving' | 'restarting' | 'done' | 'failed'

const sleepForReal = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

/** Saves what a calibration found to the printer's config. Saving restarts Klipper, so the dialog follows it until it is back. */
@customElement('config-save-dialog')
export class ConfigSaveDialog extends LitElement {
  @property({ attribute: false }) loadPending: () => Promise<PendingConfig> = getPendingConfig
  @property({ attribute: false }) save: () => Promise<unknown> = saveConfig
  @property({ attribute: false }) readKlipperState: () => Promise<KlipperState> = getKlipperState
  @property({ attribute: false }) restartFirmware: () => Promise<unknown> = firmwareRestart
  @property({ attribute: false }) sleep: (milliseconds: number) => Promise<void> = sleepForReal
  @property({ attribute: false }) startTimer: StartTimer = startBrowserTimer
  @property({ attribute: false }) close: () => void = () => this.remove()
  @property({ type: Number }) minimumRestartMilliseconds = MINIMUM_RESTART_MILLISECONDS

  @state() private phase: Phase = 'loading'
  @state() private pending: PendingConfig = { pending: false, changes: [] }
  @state() private progress: RestartProgress = { stage: 'restarting', elapsedSeconds: 0 }
  @state() private message = ''
  @state() private isHolding = false

  private gesture: HoldGesture | null = null

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isClosable()) this.close()
  }

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    window.addEventListener('keydown', this.handleKeydown)
    void this.readPending()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('keydown', this.handleKeydown)
    this.gesture?.release()
  }

  private isClosable(): boolean {
    return this.phase !== 'saving' && this.phase !== 'restarting'
  }

  private async readPending(): Promise<void> {
    try {
      this.pending = await this.loadPending()
      this.phase = this.pending.pending ? 'confirm' : 'nothing'
    } catch (error) {
      this.message = error instanceof HttpError && error.detail ? error.detail : 'Could not read the printer'
      this.phase = 'unavailable'
    }
  }

  private async startSave(): Promise<void> {
    this.isHolding = false
    this.message = ''
    this.phase = 'saving'
    try {
      await this.save()
    } catch (error) {
      this.message = error instanceof HttpError && error.detail ? error.detail : GENERAL_FAILURE
      this.phase = 'confirm'
      return
    }
    await this.followRestart()
  }

  private async followRestart(): Promise<void> {
    this.phase = 'restarting'
    this.progress = { stage: 'restarting', elapsedSeconds: 0 }
    const result = await followRestart(
      { readState: this.readKlipperState, sleep: this.sleep, minimumMilliseconds: this.minimumRestartMilliseconds },
      (progress) => (this.progress = progress),
    )
    this.message = result.message
    this.phase = result.outcome === 'ready' ? 'done' : 'failed'
    if (result.outcome === 'ready') this.dispatchEvent(new CustomEvent('control-changed', { bubbles: true }))
  }

  private async restartTheFirmware(): Promise<void> {
    try {
      await this.restartFirmware()
    } catch (error) {
      this.message = error instanceof HttpError && error.detail ? error.detail : 'Could not restart the firmware'
      return
    }
    await this.followRestart()
  }

  private getGesture(): HoldGesture {
    this.gesture ??= new HoldGesture(this.startTimer, HOLD_MILLISECONDS, () => void this.startSave())
    return this.gesture
  }

  private press(): void {
    this.getGesture().press()
    this.isHolding = true
  }

  private release(): void {
    this.getGesture().release()
    this.isHolding = false
  }

  private handleKeyPress(event: KeyboardEvent): void {
    if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) return
    event.preventDefault()
    this.press()
  }

  private handleKeyRelease(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Enter') this.release()
  }

  private renderChanges(): TemplateResult {
    return html`<div class="config-save-changes">
      ${this.pending.changes.map(
        (change) =>
          html`<span class="config-save-section">[${change.section}]</span>
            <span class="config-save-key monospace">${change.key}</span>
            <span class="config-save-value monospace"
              >${change.old ?? 'not set'} → <strong>${change.new}</strong></span
            >`,
      )}
    </div>`
  }

  private renderHoldButton(): TemplateResult {
    return html`<button
      class="config-save-hold"
      aria-label="Hold to save and restart"
      @pointerdown=${() => this.press()}
      @pointerup=${() => this.release()}
      @pointerleave=${() => this.release()}
      @pointercancel=${() => this.release()}
      @keydown=${(event: KeyboardEvent) => this.handleKeyPress(event)}
      @keyup=${(event: KeyboardEvent) => this.handleKeyRelease(event)}
      @blur=${() => this.release()}
      @contextmenu=${(event: Event) => event.preventDefault()}
    >
      <span class="config-save-hold-fill ${this.isHolding ? 'holding' : ''}"></span>
      <span class="config-save-hold-label">Hold to save and restart</span>
    </button>`
  }

  private renderConfirm(): TemplateResult {
    return html`<div class="config-save-heading">Waiting to be saved</div>
      ${this.renderChanges()}
      <div class="config-save-warning" role="note">
        ${renderIcon('alert', 16)}
        <span><strong>Saving restarts Klipper.</strong> ${RESTART_WARNING}</span>
      </div>
      ${this.message ? html`<div class="control-card-failure" role="alert">${this.message}</div>` : nothing}
      ${this.renderHoldButton()}
      <div class="muted config-save-hint">Hold for one second. With a keyboard, hold Space or Enter.</div>`
  }

  private renderProgressRow(
    label: string,
    status: 'done' | 'running' | 'waiting' | 'failed',
    note = '',
  ): TemplateResult {
    return html`<div class="config-save-step ${status}">
      <span class="config-save-dot"></span>${label}<span class="muted monospace config-save-note">${note}</span>
    </div>`
  }

  private renderRestart(): TemplateResult {
    const waiting = this.progress.stage === 'waiting'
    return html`<div class="config-save-steps">
        ${this.renderProgressRow('Config saved to printer.cfg', this.phase === 'saving' ? 'running' : 'done')}
        ${this.renderProgressRow(
          'Restarting Klipper',
          waiting ? 'done' : 'running',
          `${this.progress.elapsedSeconds} s`,
        )}
        ${this.renderProgressRow('Waiting for Klipper to be ready', waiting ? 'running' : 'waiting')}
      </div>
      <div class="muted config-save-hint">
        Keep this window open. It is ready when Klipper is. This restart is expected and is not recorded as a fault.
      </div>`
  }

  private renderDone(): TemplateResult {
    return html`<div class="config-save-steps">
      ${this.renderProgressRow('Config saved to printer.cfg', 'done')}
      ${this.renderProgressRow('Klipper is ready', 'done')}
    </div>`
  }

  private renderFailed(): TemplateResult {
    return html`<div class="config-save-steps">
        ${this.renderProgressRow('Config saved to printer.cfg', 'done')}
        ${this.renderProgressRow('Klipper is not ready', 'failed')}
      </div>
      <div class="config-save-warning error" role="alert">${renderIcon('alert', 16)}<span>${this.message}</span></div>
      <button class="button primary config-save-firmware-restart" @click=${() => void this.restartTheFirmware()}>
        ${renderIcon('refresh', 16)}Firmware restart
      </button>`
  }

  private renderBody(): TemplateResult | typeof nothing {
    switch (this.phase) {
      case 'loading':
        return html`<div class="muted">Reading the printer</div>`
      case 'unavailable':
        return html`<div class="control-card-failure" role="alert">${this.message}</div>`
      case 'nothing':
        return html`<div>Nothing is waiting to be saved.</div>`
      case 'confirm':
        return this.renderConfirm()
      case 'saving':
      case 'restarting':
        return this.renderRestart()
      case 'done':
        return this.renderDone()
      case 'failed':
        return this.renderFailed()
    }
  }

  render(): TemplateResult {
    return html`<div class="config-save-overlay" @click=${() => this.isClosable() && this.close()}>
      <div
        class="config-save-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Save config"
        @click=${(event: Event) => event.stopPropagation()}
      >
        <div class="config-save-header">
          <span class="config-save-title">Save config</span>
        </div>
        <div class="config-save-body">${this.renderBody()}</div>
        <div class="config-save-footer">
          <button class="button config-save-close" ?disabled=${!this.isClosable()} @click=${() => this.close()}>
            ${this.phase === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>`
  }
}

/** Shows the dialog on the page; it is gone when it closes. */
export function openConfigSaveDialog(): void {
  const dialog = document.createElement('config-save-dialog')
  dialog.close = () => dialog.remove()
  document.body.appendChild(dialog)
}

declare global {
  interface HTMLElementTagNameMap {
    'config-save-dialog': ConfigSaveDialog
  }
}
