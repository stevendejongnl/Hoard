import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import {
  cancelPrint as cancelPrintRequest,
  getSwitches,
  pausePrint as pausePrintRequest,
  powerOff,
  powerOn,
  resumePrint as resumePrintRequest,
  setSwitchState,
} from '../api'
import { renderIcon } from '../icons'
import {
  calculateRemainingSeconds,
  describeTemperatureStatus,
  formatFilamentMeters,
  formatFinishTime,
  formatSpentDuration,
} from '../print-job-metrics'
import type { HomeAssistantSwitch, PiStats, Power, PrinterState, Temps } from '../types'

const NO_VALUE = '—'
const SECTION_CHEVRON_SIZE = 14
const ICON_STROKE_WIDTH = 2.4
const CANCEL_QUESTION = 'Cancel this print?'
const SWITCH_REFRESH_MILLISECONDS = 10_000
const SWITCHABLE_STATES = ['on', 'off']

/** The left panel of the dashboard: what the printer is doing right now, as parameters. */
@customElement('printer-parameter-panel')
export class PrinterParameterPanel extends LitElement {
  @property({ attribute: false }) printerState: PrinterState | null = null
  @property({ attribute: false }) temperatures: Temps | null = null
  @property({ attribute: false }) power: Power | null = null
  @property({ attribute: false }) piStats: PiStats | null = null
  /** the slicer's estimate for the whole print, when the file has one */
  @property({ attribute: false }) estimatedSeconds: number | null = null
  @property({ attribute: false }) now: () => number = () => Date.now()
  @property({ type: String }) timeZone: string | undefined = undefined
  /** on a phone the print summary holds pause and cancel, and power comes first */
  @property({ type: Boolean }) isPhoneLayout = false
  @property({ attribute: false }) pausePrint: () => Promise<unknown> = pausePrintRequest
  @property({ attribute: false }) resumePrint: () => Promise<unknown> = resumePrintRequest
  @property({ attribute: false }) cancelPrint: () => Promise<unknown> = cancelPrintRequest
  @property({ attribute: false }) switchPower: (turnOn: boolean) => Promise<unknown> = (turnOn) =>
    turnOn ? powerOn() : powerOff()
  @property({ attribute: false }) confirmAction: (message: string) => boolean = (message) => window.confirm(message)
  @property({ attribute: false }) loadSwitches: () => Promise<HomeAssistantSwitch[]> = getSwitches
  @property({ attribute: false }) changeSwitch: (key: string, turnOn: boolean) => Promise<unknown> = setSwitchState

  @state() private switches: HomeAssistantSwitch[] = []
  private switchesLoadedAt = 0

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.reloadSwitches()
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('power') && this.now() - this.switchesLoadedAt >= SWITCH_REFRESH_MILLISECONDS) {
      void this.reloadSwitches()
    }
  }

  private async reloadSwitches(): Promise<void> {
    this.switchesLoadedAt = this.now()
    try {
      this.switches = await this.loadSwitches()
    } catch {
      // keep the switches that are shown: a failed refresh is not a reason to hide them
    }
  }

  private confirmSwitchOff(label: string): boolean {
    const warning = this.isPrintActive() ? 'A print is running. ' : ''
    return this.confirmAction(`${warning}Switch off ${label}?`)
  }

  private async togglePower(turnOn: boolean): Promise<void> {
    if (!turnOn && !this.confirmSwitchOff('Printer power')) return
    await this.switchPower(turnOn)
  }

  private replaceSwitchState(key: string, state: string): void {
    this.switches = this.switches.map((item) => (item.key === key ? { ...item, state } : item))
  }

  private async toggleSwitch(item: HomeAssistantSwitch): Promise<void> {
    const turnOn = item.state !== 'on'
    if (!turnOn && !this.confirmSwitchOff(item.label)) return
    try {
      await this.changeSwitch(item.key, turnOn)
      this.replaceSwitchState(item.key, turnOn ? 'on' : 'off')
    } catch {
      // the switch keeps the state it showed
    }
  }

  private isPrintActive(): boolean {
    return this.printerState?.state === 'printing' || this.printerState?.state === 'paused'
  }

  private renderSectionHeader(title: string): TemplateResult {
    return html`<div class="section-header">
      ${renderIcon('chevron-down', SECTION_CHEVRON_SIZE, ICON_STROKE_WIDTH)}${title}
    </div>`
  }

  private renderField(label: string, name: string, value: string, unit = ''): TemplateResult {
    return html`<div class="parameter-row">
      <span class="parameter-label">${label}</span>${this.renderValue(name, value, unit)}
    </div>`
  }

  private renderValue(name: string, value: string, unit = '', extraClass = ''): TemplateResult {
    const unitText = unit === '' ? nothing : html`<span class="value-unit">${unit}</span>`
    return html`<span class="value-field ${extraClass}" data-field=${name}>${value}${unitText}</span>`
  }

  private readRemainingSeconds(): number | null {
    const state = this.printerState
    if (!state || !this.isPrintActive()) return null
    return calculateRemainingSeconds({
      estimatedSeconds: this.estimatedSeconds,
      spentSeconds: state.time_remaining,
      progress: state.progress,
    })
  }

  private describeLayer(state: PrinterState): string {
    if (state.layer === null || !state.layer_total) return NO_VALUE
    return `${state.layer} / ${state.layer_total}`
  }

  private renderPrintJob(): TemplateResult {
    const state = this.isPrintActive() ? this.printerState : null
    const remaining = this.readRemainingSeconds()
    return html`<div class="section">
      ${this.renderSectionHeader('Print job')}
      <div class="section-body">
        <div class="parameter-row"><span class="parameter-label">File</span></div>
        <div class="print-file-line monospace">${state?.filename ?? NO_VALUE}</div>
        ${this.renderField('Progress', 'progress', state ? state.progress.toFixed(1) : NO_VALUE, state ? '%' : '')}
        ${this.renderField('Elapsed', 'elapsed', state ? formatSpentDuration(state.time_remaining) : NO_VALUE)}
        ${this.renderField('Remaining', 'remaining', remaining === null ? NO_VALUE : formatSpentDuration(remaining))}
        ${this.renderField('Finish at', 'finish', formatFinishTime(this.now(), remaining, this.timeZone))}
        ${this.renderField('Speed', 'speed', state ? String(state.speed) : NO_VALUE, state ? 'mm/s' : '')}
        ${this.renderField(
          'Filament used',
          'filament',
          state ? formatFilamentMeters(state.filament_used) : NO_VALUE,
          state ? 'm' : '',
        )}
        ${this.renderField('Layer', 'layer', state ? this.describeLayer(state) : NO_VALUE)}
      </div>
    </div>`
  }

  private renderHeater(label: string, color: string, key: 'hotend' | 'bed'): TemplateResult {
    const temperatures = this.temperatures
    const actual = temperatures ? temperatures[`${key}_actual`].toFixed(1) : NO_VALUE
    const target = temperatures ? String(temperatures[`${key}_target`]) : NO_VALUE
    return html`<div class="parameter-row">
      <span class="parameter-label heater-label"
        ><span class="heater-swatch" style="background: ${color}"></span>${label}</span
      >
      <span class="heater-values">
        ${this.renderValue(`${key}-actual`, actual, '°C')}${this.renderValue(
          `${key}-target`,
          target,
          '°C',
          'target-field',
        )}
      </span>
    </div>`
  }

  private renderTemperatures(): TemplateResult {
    return html`<div class="section">
      ${this.renderSectionHeader('Temperatures')}
      <div class="section-body">
        ${this.renderHeater('Hotend', '#FFD54F', 'hotend')} ${this.renderHeater('Bed', '#64B5F6', 'bed')}
        <div class="parameter-row status-row">
          <span class="muted temperature-status"
            >${this.temperatures ? describeTemperatureStatus(this.temperatures) : 'actual / target'}</span
          >
        </div>
      </div>
    </div>`
  }

  private renderPowerSwitch(): TemplateResult {
    const isOn = this.power?.switch === 'on'
    return html`<div class="parameter-row">
      <span class="parameter-label">Printer power</span>
      <button
        class="power-switch ${isOn ? 'on' : ''}"
        role="switch"
        aria-checked=${isOn ? 'true' : 'false'}
        aria-label="Printer power"
        @click=${() => this.togglePower(!isOn)}
      >
        <span class="power-switch-knob"></span>
      </button>
    </div>`
  }

  private renderExtraSwitch(item: HomeAssistantSwitch): TemplateResult {
    const isOn = item.state === 'on'
    return html`<div class="parameter-row">
      <span class="parameter-label">${item.label}</span>
      <button
        class="power-switch ${isOn ? 'on' : ''}"
        role="switch"
        aria-checked=${isOn ? 'true' : 'false'}
        aria-label=${item.label}
        data-switch=${item.key}
        ?disabled=${!SWITCHABLE_STATES.includes(item.state)}
        @click=${() => this.toggleSwitch(item)}
      >
        <span class="power-switch-knob"></span>
      </button>
    </div>`
  }

  private renderPower(): TemplateResult {
    return html`<div class="section">
      ${this.renderSectionHeader('Power & energy')}
      <div class="section-body">
        ${this.renderPowerSwitch()} ${this.switches.map((item) => this.renderExtraSwitch(item))}
        ${this.renderField('Draw', 'draw', this.power ? String(Math.round(this.power.watts)) : NO_VALUE, 'W')}
        ${this.renderField('Price', 'price', this.power ? this.power.eur_per_kwh.toFixed(2) : NO_VALUE, '€/kWh')}
      </div>
    </div>`
  }

  private renderPi(): TemplateResult {
    const stats = this.piStats
    const percent = (value: number | undefined) => (stats && value !== undefined ? value.toFixed(1) : NO_VALUE)
    return html`<div class="section">
      ${this.renderSectionHeader('Raspberry Pi')}
      <div class="section-body">
        ${this.renderField('CPU temp', 'cpu-temperature', percent(stats?.cpu_temp), '°C')}
        ${this.renderField('CPU load', 'cpu-load', percent(stats?.cpu_load), '%')}
        ${this.renderField('Memory', 'memory', percent(stats?.memory_pct), '%')}
        ${this.renderField('Disk', 'disk', percent(stats?.disk_pct), '%')}
        ${this.renderField('Uptime', 'uptime', stats ? formatSpentDuration(stats.uptime_s) : NO_VALUE)}
      </div>
    </div>`
  }

  private async handlePause(): Promise<void> {
    if (this.printerState?.state === 'paused') await this.resumePrint()
    else await this.pausePrint()
  }

  private async handleCancel(): Promise<void> {
    if (!this.confirmAction(CANCEL_QUESTION)) return
    await this.cancelPrint()
  }

  private renderButtons(): TemplateResult | typeof nothing {
    if (!this.isPrintActive()) return nothing
    const isPaused = this.printerState?.state === 'paused'
    return html`<div class="parameter-footer">
      <button class="button primary pause-button" @click=${this.handlePause}>
        ${renderIcon(isPaused ? 'play' : 'pause', 16)}${isPaused ? 'Resume print' : 'Pause print'}
      </button>
      <button class="button danger cancel-button" @click=${this.handleCancel}>${renderIcon('close', 16)}Cancel</button>
    </div>`
  }

  private renderPhone(): TemplateResult {
    return html`<div class="parameter-body">
      ${this.renderPower()} ${this.renderPrintJob()} ${this.renderTemperatures()} ${this.renderPi()}
    </div>`
  }

  render(): TemplateResult {
    if (this.isPhoneLayout) return this.renderPhone()
    return html`<div class="parameter-body">
        ${this.renderPrintJob()} ${this.renderTemperatures()} ${this.renderPower()} ${this.renderPi()}
      </div>
      ${this.renderButtons()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'printer-parameter-panel': PrinterParameterPanel
  }
}
