import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { ControlStatus } from '../types'
import { ControlCard } from './control-card'
import './control-z-offset'

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

const SPEED_RANGE = { minimum: 10, maximum: 200 }
const FLOW_RANGE = { minimum: 50, maximum: 200 }
const FAN_RANGE = { minimum: 0, maximum: 100 }

function describeValue(slider: Slider, value: number): string {
  return slider.offText && value === 0 ? 'off' : `${value} %`
}

/** Speed, flow and fans as sliders, and the Z offset in small steps. All of it stays available during a print. */
@customElement('control-tuning-card')
export class ControlTuningCard extends ControlCard {
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

  render(): TemplateResult {
    const sliders = this.listSliders()
    const body = this.status
      ? html`${sliders.map((slider) => this.renderSlider(slider))}
          <control-z-offset .status=${this.status} .send=${this.send}></control-z-offset>`
      : html`<div class="muted control-empty">No reading</div>`
    return this.renderFrame('Speed, flow and fans', 'sliders', body)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-tuning-card': ControlTuningCard
  }
}
