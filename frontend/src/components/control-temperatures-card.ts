import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import type { ControlHeater } from '../types'
import { ControlCard } from './control-card'

interface Preset {
  name: string
  nozzle: number
  bed: number
}

const PRESETS: Preset[] = [
  { name: 'PLA', nozzle: 210, bed: 60 },
  { name: 'PETG', nozzle: 240, bed: 80 },
  { name: 'ABS', nozzle: 250, bed: 100 },
]
const SWATCH_COLORS: Record<string, string> = { extruder: 'var(--danger-color)', heater_bed: 'var(--hotend-color)' }
const COOL = 0

function describePreset(preset: Preset): string {
  return `${preset.name} ${preset.nozzle} / ${preset.bed}`
}

function summarize(heaters: ControlHeater[]): string {
  return heaters.map((heater) => `${heater.label} ${Math.round(heater.temperature)}`).join(' / ')
}

/** What each heater reads and is set to, and presets that set the nozzle and the bed together. */
@customElement('control-temperatures-card')
export class ControlTemperaturesCard extends ControlCard {
  private async setTarget(key: string, target: number): Promise<void> {
    await this.command('temperature', { heater: key, target })
  }

  private async setBoth(nozzle: number, bed: number): Promise<void> {
    await this.setTarget('extruder', nozzle)
    await this.setTarget('heater_bed', bed)
  }

  private changeTarget(key: string, field: HTMLInputElement): void {
    const target = Number(field.value)
    if (field.value.trim() === '' || Number.isNaN(target)) return
    void this.setTarget(key, target)
  }

  private renderHeater(heater: ControlHeater): TemplateResult {
    return html`<div class="control-heater-row">
      <span class="control-heater-name"
        ><span class="control-swatch" style="background: ${SWATCH_COLORS[heater.key] ?? 'var(--ok-color)'}"></span
        >${heater.label}</span
      >
      <span class="monospace control-heater-reading">${Math.round(heater.temperature)} °C</span>
      <label class="control-field">
        <input
          type="number"
          min="0"
          data-heater=${heater.key}
          aria-label="${heater.label} target"
          .value=${String(heater.target)}
          @change=${(event: Event) => this.changeTarget(heater.key, event.target as HTMLInputElement)}
        /><span class="muted">°C</span>
      </label>
    </div>`
  }

  private renderPresets(): TemplateResult {
    return html`<div class="control-presets">
      <span class="control-label">Presets</span>
      <div class="control-chips">
        ${PRESETS.map(
          (preset) =>
            html`<button class="control-chip" @click=${() => void this.setBoth(preset.nozzle, preset.bed)}>
              ${describePreset(preset)}
            </button>`,
        )}
        <button class="button" @click=${() => void this.setBoth(COOL, COOL)}>Cool down</button>
      </div>
    </div>`
  }

  render(): TemplateResult {
    const heaters = this.status?.heaters ?? []
    const rows =
      heaters.length > 0
        ? heaters.map((heater) => this.renderHeater(heater))
        : html`<div class="muted control-empty">No reading</div>`
    return this.renderFrame(
      'Temperatures',
      'thermometer',
      html`<div class="control-heaters">${rows}</div>
        ${this.renderPresets()}`,
      html`${summarize(heaters)}`,
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-temperatures-card': ControlTemperaturesCard
  }
}
