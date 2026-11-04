import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { allowControlAccess, denyControlAccess, getControlAccess, takeControlAccessBack } from '../api'
import { renderIcon } from '../icons'
import { sseClient } from '../sse'
import type { AccessGrant, AccessRequest, ControlAccessSnapshot } from '../types'
import '../styles/control.css'

type StopFunction = () => void
type UpdatePayload = { type: string; data: unknown }

const GRANT_MINUTES = 30
const SECONDS_PER_MINUTE = 60
const TICK_MILLISECONDS = 5000
const MILLISECONDS_PER_SECOND = 1000
const EMPTY: ControlAccessSnapshot = { pending: [], granted: [] }

function tickEveryFewSeconds(callback: () => void): StopFunction {
  const timer = setInterval(callback, TICK_MILLISECONDS)
  return () => clearInterval(timer)
}

/**
 * Above every page: an assistant that asks to control the printer, and the ones that may.
 * What the assistant says it wants is shown as plain text, because the assistant wrote it.
 */
@customElement('control-access-prompt')
export class ControlAccessPrompt extends LitElement {
  @property({ attribute: false }) loadAccess: () => Promise<ControlAccessSnapshot> = getControlAccess
  @property({ attribute: false }) allow: (requestId: string) => Promise<unknown> = allowControlAccess
  @property({ attribute: false }) deny: (requestId: string) => Promise<unknown> = denyControlAccess
  @property({ attribute: false }) takeBack: (client: string) => Promise<unknown> = takeControlAccessBack
  @property({ attribute: false }) subscribeToUpdates: (handler: (payload: UpdatePayload) => void) => StopFunction = (
    handler,
  ) => sseClient.subscribe(handler)
  @property({ attribute: false }) repeatEvery: (callback: () => void) => StopFunction = tickEveryFewSeconds
  /** seconds since 1970 */
  @property({ attribute: false }) now: () => number = () => Date.now() / MILLISECONDS_PER_SECOND

  @state() private snapshot: ControlAccessSnapshot = EMPTY

  private stopListening: StopFunction | null = null
  private stopTicking: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.stopListening = this.subscribeToUpdates((payload) => this.receive(payload))
    this.stopTicking = this.repeatEvery(() => this.requestUpdate())
    void this.refresh()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopListening?.()
    this.stopTicking?.()
  }

  private receive(payload: UpdatePayload): void {
    if (payload.type === 'control_access') this.snapshot = payload.data as ControlAccessSnapshot
  }

  private async refresh(): Promise<void> {
    try {
      this.snapshot = await this.loadAccess()
    } catch {
      this.snapshot = EMPTY
    }
  }

  private async answer(action: () => Promise<unknown>): Promise<void> {
    try {
      await action()
    } finally {
      await this.refresh()
    }
  }

  private renderRequest(request: AccessRequest): TemplateResult {
    return html`<div class="control-access-request">
      <p class="control-access-question">
        <strong>${request.client}</strong> wants to control the printer: move it, heat it and run macros.
      </p>
      ${request.reason
        ? html`<p class="control-access-reason"><span class="control-label">Reason given</span>${request.reason}</p>`
        : nothing}
      <p class="muted control-access-note">
        The access ends by itself after ${GRANT_MINUTES} minutes. Pause and stop are never held back.
      </p>
      <div class="control-button-row">
        <button class="button primary" @click=${() => void this.answer(() => this.allow(request.id))}>
          Allow for ${GRANT_MINUTES} minutes
        </button>
        <button class="button" @click=${() => void this.answer(() => this.deny(request.id))}>Deny</button>
      </div>
    </div>`
  }

  private renderDialog(requests: AccessRequest[]): TemplateResult | typeof nothing {
    if (requests.length === 0) return nothing
    return html`<div class="control-access-backdrop">
      <div class="control-access-dialog" role="alertdialog" aria-modal="true" aria-label="Control request">
        <div class="control-access-title">${renderIcon('lock', 16)}Control request</div>
        ${requests.map((request) => this.renderRequest(request))}
      </div>
    </div>`
  }

  private describeTimeLeft(grant: AccessGrant): string {
    const minutes = Math.ceil((grant.expires_at - this.now()) / SECONDS_PER_MINUTE)
    return `${minutes} min`
  }

  private renderGrant(grant: AccessGrant): TemplateResult {
    return html`<div class="control-access-grant">
      <span>
        <strong>${grant.client}</strong> may control the printer, for another
        <span class="monospace">${this.describeTimeLeft(grant)}</span>
      </span>
      <button class="button" @click=${() => void this.answer(() => this.takeBack(grant.client))}>Take back</button>
    </div>`
  }

  render(): TemplateResult {
    const now = this.now()
    const requests = this.snapshot.pending.filter((request) => request.expires_at > now)
    const grants = this.snapshot.granted.filter((grant) => grant.expires_at > now)
    return html`${grants.map((grant) => this.renderGrant(grant))} ${this.renderDialog(requests)}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-access-prompt': ControlAccessPrompt
  }
}
