import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import {
  cancelPrint as cancelPrintRequest,
  pausePrint as pausePrintRequest,
  resumePrint as resumePrintRequest,
} from '../api'
import { renderIcon } from '../icons'
import { calculateRemainingSeconds, formatFinishTime, formatSpentDuration } from '../print-job-metrics'
import type { PrinterState } from '../types'
import { askForConfirmation } from './confirmation-dialog'

const CANCEL_QUESTION = 'Cancel this print?'
const BUTTON_ICON_SIZE = 16

/** The top of the phone dashboard: the running print, how far it is and the buttons to pause or cancel it. */
@customElement('phone-print-summary')
export class PhonePrintSummary extends LitElement {
  @property({ attribute: false }) printerState: PrinterState | null = null
  /** the slicer's estimate for the whole print, when the file has one */
  @property({ attribute: false }) estimatedSeconds: number | null = null
  @property({ attribute: false }) now: () => number = () => Date.now()
  @property({ type: String }) timeZone: string | undefined = undefined
  @property({ attribute: false }) pausePrint: () => Promise<unknown> = pausePrintRequest
  @property({ attribute: false }) resumePrint: () => Promise<unknown> = resumePrintRequest
  @property({ attribute: false }) cancelPrint: () => Promise<unknown> = cancelPrintRequest
  @property({ attribute: false }) confirmAction: (message: string) => Promise<boolean> = askForConfirmation

  createRenderRoot() {
    return this
  }

  private isPrintActive(): boolean {
    return this.printerState?.state === 'printing' || this.printerState?.state === 'paused'
  }

  private async handlePause(): Promise<void> {
    if (this.printerState?.state === 'paused') await this.resumePrint()
    else await this.pausePrint()
  }

  private async handleCancel(): Promise<void> {
    if (!(await this.confirmAction(CANCEL_QUESTION))) return
    await this.cancelPrint()
  }

  private describeFinish(state: PrinterState): string {
    const remaining = calculateRemainingSeconds({
      estimatedSeconds: this.estimatedSeconds,
      spentSeconds: state.time_remaining,
      progress: state.progress,
    })
    if (remaining === null) return ''
    return `Done ${formatFinishTime(this.now(), remaining, this.timeZone)} · ${formatSpentDuration(remaining)} left`
  }

  private renderProgress(state: PrinterState): TemplateResult {
    return html`<div class="summary-line">
        <span class="monospace summary-progress">${state.progress.toFixed(1)} <span class="muted">%</span></span>
        <span class="muted summary-finish">${this.describeFinish(state)}</span>
      </div>
      <div
        class="timeline-bar"
        role="progressbar"
        aria-label="Print progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${Math.round(state.progress)}
      >
        <div class="timeline-fill" style="width: ${state.progress}%"></div>
      </div>`
  }

  private renderButtons(state: PrinterState): TemplateResult {
    const isPaused = state.state === 'paused'
    return html`<div class="summary-buttons">
      <button class="button primary pause-button" @click=${this.handlePause}>
        ${renderIcon(isPaused ? 'play' : 'pause', BUTTON_ICON_SIZE)}${isPaused ? 'Resume' : 'Pause'}
      </button>
      <button class="button danger cancel-button" @click=${this.handleCancel}>
        ${renderIcon('close', BUTTON_ICON_SIZE)}Cancel
      </button>
    </div>`
  }

  render(): TemplateResult {
    const state = this.isPrintActive() ? this.printerState : null
    return html`<section class="phone-summary" aria-label="Current print">
      <span class="monospace summary-file">${state?.filename ?? 'No print running'}</span>
      ${state ? html`${this.renderProgress(state)}${this.renderButtons(state)}` : nothing}
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'phone-print-summary': PhonePrintSummary
  }
}
