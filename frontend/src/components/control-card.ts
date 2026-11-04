import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { HttpError, sendControlCommand } from '../api'
import { renderIcon } from '../icons'
import type { IconName } from '../icons'
import type { ControlStatus } from '../types'

const GENERAL_FAILURE = 'Could not send the command'

/** The part every card of the Control page shares: its frame, sending a command, and saying why one failed. */
export abstract class ControlCard extends LitElement {
  @property({ attribute: false }) status: ControlStatus | null = null
  /** true while the printer prints, and when it cannot be reached */
  @property({ type: Boolean }) locked = false
  @property({ attribute: false }) send: (route: string, body: object) => Promise<unknown> = sendControlCommand

  @state() protected failure = ''

  createRenderRoot() {
    return this
  }

  /** Sends a command; when the printer took it, the page reads the status again. */
  protected async command(route: string, body: object = {}): Promise<void> {
    try {
      await this.send(route, body)
    } catch (error) {
      this.failure = error instanceof HttpError && error.detail ? error.detail : GENERAL_FAILURE
      return
    }
    this.failure = ''
    this.dispatchEvent(new CustomEvent('control-changed', { bubbles: true, composed: true }))
  }

  protected renderFailure(): TemplateResult | typeof nothing {
    return this.failure ? html`<div class="control-card-failure" role="alert">${this.failure}</div>` : nothing
  }

  protected renderFrame(
    title: string,
    icon: IconName,
    body: TemplateResult,
    note: TemplateResult | typeof nothing = nothing,
  ): TemplateResult {
    return html`<section class="control-card ${this.locked ? 'locked' : ''}" aria-label=${title}>
      <div class="control-card-header">
        ${renderIcon(icon, 14)}${title}<span class="control-card-header-note">${note}</span>
      </div>
      <div class="control-card-body">${body} ${this.renderFailure()}</div>
    </section>`
  }
}
