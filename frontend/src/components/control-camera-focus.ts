import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { sendControlCommand } from '../api'
import { renderIcon } from '../icons'
import type { ControlStatus } from '../types'
import './camera-panel'
import './control-move-card'
import './control-z-offset'

/**
 * The camera large, with the controls to line the head up and to babystep Z next to it.
 * The Z babystep stays available during a print; the jog does not.
 */
@customElement('control-camera-focus')
export class ControlCameraFocus extends LitElement {
  @property({ attribute: false }) status: ControlStatus | null = null
  @property({ type: Boolean }) locked = false
  @property({ attribute: false }) send: (route: string, body: object) => Promise<unknown> = sendControlCommand

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('keydown', this.closeOnEscape)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('keydown', this.closeOnEscape)
  }

  private readonly closeOnEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.close()
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('control-camera-focus-close', { bubbles: true, composed: true }))
  }

  private renderBabystep(): TemplateResult {
    return html`<section class="control-card control-focus-babystep">
      <div class="control-card-header">${renderIcon('crosshair', 14)}Z babystep</div>
      <div class="control-card-body">
        <control-z-offset
          .status=${this.status}
          .send=${this.send}
          .showSave=${true}
          ?locked=${this.locked}
        ></control-z-offset>
      </div>
    </section>`
  }

  render(): TemplateResult {
    return html`<div class="control-focus" role="dialog" aria-modal="true" aria-label="Camera with controls">
      <div class="control-focus-header">
        <span class="control-focus-title">${renderIcon('camera', 16)}Camera</span>
        <button
          class="button flat icon-only control-focus-close"
          aria-label="Close the camera"
          @click=${() => this.close()}
        >
          ${renderIcon('close', 18)}
        </button>
      </div>
      <div class="control-focus-body">
        <div class="control-focus-camera"><camera-panel></camera-panel></div>
        <div class="control-focus-controls">
          <control-move-card .status=${this.status} .send=${this.send} ?locked=${this.locked}></control-move-card>
          ${this.renderBabystep()}
        </div>
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-camera-focus': ControlCameraFocus
  }
}
