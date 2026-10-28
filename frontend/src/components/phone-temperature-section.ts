import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { Power, Temps } from '../types'
import './temperature-chart'

const NO_VALUE = '—'

/** The temperature chart of the phone dashboard, with what the printer draws from the mains. */
@customElement('phone-temperature-section')
export class PhoneTemperatureSection extends LitElement {
  @property({ attribute: false }) temperatures: Temps | null = null
  @property({ attribute: false }) power: Power | null = null

  createRenderRoot() {
    return this
  }

  private renderLegendItem(color: string, actual: number | undefined): TemplateResult {
    const text = actual === undefined ? NO_VALUE : `${actual.toFixed(1)}°`
    return html`<span class="monospace legend-item"
      ><span class="legend-line" style="background: ${color}"></span><span class="legend-value">${text}</span></span
    >`
  }

  private renderField(label: string, name: string, value: string, unit: string): TemplateResult {
    return html`<div class="parameter-row">
      <span class="parameter-label">${label}</span
      ><span class="value-field" data-field=${name}>${value}<span class="value-unit">${unit}</span></span>
    </div>`
  }

  render(): TemplateResult {
    return html`<section class="phone-temperature" aria-label="Temperatures">
      <div class="phone-temperature-heading">
        <span class="section-title">Temperature</span>
        <span class="legend"
          >${this.renderLegendItem('#FFD54F', this.temperatures?.hotend_actual)}${this.renderLegendItem(
            '#64B5F6',
            this.temperatures?.bed_actual,
          )}</span
        >
      </div>
      <temperature-chart variant="compact"></temperature-chart>
      ${this.renderField('Power', 'draw', this.power ? String(Math.round(this.power.watts)) : NO_VALUE, 'W')}
      ${this.renderField('Price', 'price', this.power ? this.power.eur_per_kwh.toFixed(2) : NO_VALUE, '€/kWh')}
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'phone-temperature-section': PhoneTemperatureSection
  }
}
