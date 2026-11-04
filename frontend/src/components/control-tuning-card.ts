import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { renderIcon } from '../icons'
import type { ControlStatus } from '../types'
import { ControlCard } from './control-card'

interface Slider {
  name: string
  label: string
  value: number
  minimum: number
  maximum: number
  /** the command that sets it, and the extra values it needs */
  route: string
  extra: object
  offText: boolean
}

const Z_STEPS = [0.01, 0.05, 0.1]
const SPEED_RANGE = { minimum: 10, maximum: 200 }
const FLOW_RANGE = { minimum: 50, maximum: 200 }
const FAN_RANGE = { minimum: 0, maximum: 100 }

function describeValue(slider: Slider, value: number): string {
  return slider.offText && value === 0 ? 'off' : `${value} %`
}

/** Speed, flow and fans as sliders, and the Z offset in small steps. All of it stays available during a print. */
@customElement('control-tuning-card')
export class ControlTuningCard extends ControlCard {
  @state() private zStep = 0.05
  /** what a slider shows while it is dragged and the printer has not heard of it yet */
  @state() private drafts: Record<string, number> = {}

  private listFanSliders(status: ControlStatus): Slider[] {
    return status.fans.map((fan) => ({
      name: `fan:${fan.key}`,
      label: fan.label,
      value: fan.percent,
      ...FAN_RANGE,
      route: 'fan',
      extra: fan.key ? { name: fan.key } : {},
      offText: true,
    }))
  }

  private listSliders(): Slider[] {
    const status = this.status
    if (!status) return []
    const speed = { name: 'speed', label: 'Speed', value: status.speed_percent, ...SPEED_RANGE, route: 'speed' }
    const flow = { name: 'flow', label: 'Flow', value: status.flow_percent, ...FLOW_RANGE, route: 'flow' }
    return [
      { ...speed, extra: {}, offText: false },
      { ...flow, extra: {}, offText: false },
      ...this.listFanSliders(status),
    ]
  }

  private showDraft(name: string, field: HTMLInputElement): void {
    this.drafts = { ...this.drafts, [name]: Number(field.value) }
  }

  private async sendSlider(slider: Slider, field: HTMLInputElement): Promise<void> {
    await this.command(slider.route, { percent: Number(field.value), ...slider.extra })
    this.drafts = Object.fromEntries(Object.entries(this.drafts).filter(([name]) => name !== slider.name))
  }

  private renderSlider(slider: Slider): TemplateResult {
    const value = this.drafts[slider.name] ?? slider.value
    return html`<div class="control-slider-row">
      <span class="control-slider-label">${slider.label}</span>
      <input
        type="range"
        data-control=${slider.name}
        aria-label=${slider.label}
        min=${slider.minimum}
        max=${slider.maximum}
        .value=${String(value)}
        @input=${(event: Event) => this.showDraft(slider.name, event.target as HTMLInputElement)}
        @change=${(event: Event) => void this.sendSlider(slider, event.target as HTMLInputElement)}
      />
      <span class="monospace control-slider-value" data-value=${slider.name}>${describeValue(slider, value)}</span>
    </div>`
  }

  private renderZStepChips(): TemplateResult {
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

  private renderZKey(label: string, icon: 'arrow-up' | 'arrow-down', offset: number): TemplateResult {
    return html`<button
      class="control-key"
      aria-label=${label}
      @click=${() => void this.command('babystep', { offset })}
    >
      ${renderIcon(icon, 18)}
    </button>`
  }

  private renderZOffset(offset: number): TemplateResult {
    return html`<div class="control-z-offset">
        <span class="control-z-offset-label">Z offset</span>
        ${this.renderZKey(`Lower ${this.zStep}`, 'arrow-down', -this.zStep)}
        <span class="monospace control-z-offset-value">${offset.toFixed(3)} mm</span>
        ${this.renderZKey(`Raise ${this.zStep}`, 'arrow-up', this.zStep)}
      </div>
      ${this.renderZStepChips()}`
  }

  render(): TemplateResult {
    const sliders = this.listSliders()
    const body = this.status
      ? html`${sliders.map((slider) => this.renderSlider(slider))} ${this.renderZOffset(this.status.z_offset)}`
      : html`<div class="muted control-empty">No reading</div>`
    return this.renderFrame('Speed, flow and fans', 'sliders', body)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-tuning-card': ControlTuningCard
  }
}
