import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import { renderIcon } from '../icons'
import { ControlCard } from './control-card'
import './camera-panel'

/** The live camera. Its header button opens the camera on a screen of its own, with the move controls. */
@customElement('control-camera-card')
export class ControlCameraCard extends ControlCard {
  private openFocus(): void {
    this.dispatchEvent(new CustomEvent('control-camera-focus', { bubbles: true, composed: true }))
  }

  render(): TemplateResult {
    const fullscreen = html`<button
      class="button flat icon-only control-card-action"
      aria-label="Fullscreen camera with controls"
      @click=${() => this.openFocus()}
    >
      ${renderIcon('expand', 16)}
    </button>`
    return this.renderFrame('Camera', 'camera', html`<camera-panel></camera-panel>`, fullscreen)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-camera-card': ControlCameraCard
  }
}
