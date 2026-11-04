import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { renderIcon } from '../icons'
import { ControlCard } from './control-card'

const Z_STEPS = [0.01, 0.05, 0.1]

/** The Z offset and the keys that nudge it. It stays available during a print: that is when it is needed. */
@customElement('control-z-offset')
export class ControlZOffset extends ControlCard {
  @state() private zStep = 0.05

  private renderStepChips(): TemplateResult {
    return html`<div class="control-chips">
      ${Z_STEPS.map(
        (step) =>
          html`<button
            class="control-chip"
            aria-pressed=${this.zStep === step ? 'true' : 'false'}
            @click=${() => (this.zStep = step)}
          >
            ${step}
          </button>`,
      )}
    </div>`
  }

  private renderKey(label: string, icon: 'arrow-up' | 'arrow-down', offset: number): TemplateResult {
    return html`<button
      class="control-key"
      aria-label=${label}
      @click=${() => void this.command('babystep', { offset })}
    >
      ${renderIcon(icon, 18)}
    </button>`
  }

  render(): TemplateResult {
    const offset = this.status?.z_offset ?? 0
    return html`<div class="control-z-offset">
        <span class="control-z-offset-label">Z offset</span>
        ${this.renderKey(`Lower ${this.zStep}`, 'arrow-down', -this.zStep)}
        <span class="monospace control-z-offset-value">${offset.toFixed(3)} mm</span>
        ${this.renderKey(`Raise ${this.zStep}`, 'arrow-up', this.zStep)}
      </div>
      ${this.renderStepChips()} ${this.renderFailure()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-z-offset': ControlZOffset
  }
}
