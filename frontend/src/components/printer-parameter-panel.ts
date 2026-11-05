import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import {
  cancelAutoPowerOff as cancelAutoPowerOffRequest,
  cancelPrint as cancelPrintRequest,
  getAutoPowerOff,
  getSwitches,
  postponeAutoPowerOff as postponeAutoPowerOffRequest,
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
import type { AutoPowerOffStatus, HomeAssistantSwitch, PiStats, Power, PrinterState, Temps } from '../types'
import { findDependentSwitches, findRequiredSwitch, joinLabels } from '../switch-dependencies'
import { askForConfirmation } from './confirmation-dialog'

const NO_VALUE = '—'
const SECTION_CHEVRON_SIZE = 14
const ICON_STROKE_WIDTH = 2.4
const CANCEL_QUESTION = 'Cancel this print?'
const SWITCH_REFRESH_MILLISECONDS = 10_000
const READ_AFTER_CHANGE_MILLISECONDS = 2_000
const SWITCHABLE_STATES = ['on', 'off']
const POSTPONE_MINUTES = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1000

type StopFunction = () => void

function repeatWithInterval(callback: () => void): StopFunction {
  const interval = setInterval(callback, SWITCH_REFRESH_MILLISECONDS)
  return () => clearInterval(interval)
}

function waitForHomeAssistant(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, READ_AFTER_CHANGE_MILLISECONDS))
}

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
  @property({ attribute: false }) confirmAction: (message: string) => Promise<boolean> = askForConfirmation
  @property({ attribute: false }) loadSwitches: () => Promise<HomeAssistantSwitch[]> = getSwitches
  @property({ attribute: false }) changeSwitch: (key: string, turnOn: boolean) => Promise<unknown> = setSwitchState
  @property({ attribute: false }) loadAutoPowerOff: () => Promise<AutoPowerOffStatus> = getAutoPowerOff
  @property({ attribute: false }) postponeAutoPowerOff: (minutes: number) => Promise<unknown> =
    postponeAutoPowerOffRequest
  @property({ attribute: false }) cancelAutoPowerOff: () => Promise<unknown> = cancelAutoPowerOffRequest
  @property({ attribute: false }) repeatEvery: (callback: () => void) => StopFunction = repeatWithInterval
  /** Home Assistant takes a moment before a switched entity reports its new state */
  @property({ attribute: false }) waitBeforeReading: () => Promise<void> = waitForHomeAssistant

  @state() private switches: HomeAssistantSwitch[] = []
  @state() private autoPowerOff: AutoPowerOffStatus | null = null
  private stopRefreshing: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.reloadSwitches()
    void this.reloadAutoPowerOff()
    this.stopRefreshing = this.repeatEvery(() => {
      void this.reloadSwitches()
      void this.reloadAutoPowerOff()
    })
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopRefreshing?.()
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    const printerState = this.power?.switch ?? ''
    if (!changed.has('power') || !SWITCHABLE_STATES.includes(printerState)) return
    this.switches = this.switches.map((item) => (item.is_printer ? { ...item, state: printerState } : item))
  }

  private async reloadAutoPowerOff(): Promise<void> {
    try {
      this.autoPowerOff = await this.loadAutoPowerOff()
    } catch {
      // the line stays as it is: a failed refresh is not a reason to hide it
    }
  }

  private async changeAutoPowerOff(change: () => Promise<unknown>): Promise<void> {
    try {
      await change()
    } finally {
      await this.reloadAutoPowerOff()
    }
  }

  private async reloadSwitches(): Promise<void> {
    try {
      this.switches = await this.loadSwitches()
    } catch {
      // keep the switches that are shown: a failed refresh is not a reason to hide them
    }
  }

  private confirmSwitchOff(label: string, alsoOff: HomeAssistantSwitch[] = []): Promise<boolean> {
    const warning = this.isPrintActive() ? 'A print is running. ' : ''
    const consequence = alsoOff.length
      ? ` This also switches off ${joinLabels(alsoOff.map((item) => item.label))}.`
      : ''
    return this.confirmAction(`${warning}Switch off ${label}?${consequence}`)
  }

  private async togglePower(turnOn: boolean): Promise<void> {
    if (!turnOn && !(await this.confirmSwitchOff('Printer power'))) return
    await this.switchPower(turnOn)
    void this.readAfterChange()
  }

  private replaceSwitchStates(keys: string[], state: string): void {
    this.switches = this.switches.map((item) => (keys.includes(item.key) ? { ...item, state } : item))
  }

  private findDependentsThatAreOn(item: HomeAssistantSwitch): HomeAssistantSwitch[] {
    return findDependentSwitches(this.switches, item.key).filter((dependent) => dependent.state === 'on')
  }

  private sendSwitch(item: HomeAssistantSwitch, turnOn: boolean): Promise<unknown> {
    if (item.is_printer) return this.switchPower(turnOn)
    return this.changeSwitch(item.key, turnOn)
  }

  private async readAfterChange(): Promise<void> {
    await this.waitBeforeReading()
    await this.reloadSwitches()
  }

  private async toggleSwitch(item: HomeAssistantSwitch): Promise<void> {
    const turnOn = item.state !== 'on'
    const alsoOff = turnOn ? [] : this.findDependentsThatAreOn(item)
    if (!turnOn && !(await this.confirmSwitchOff(item.label, alsoOff))) return
    try {
      await this.sendSwitch(item, turnOn)
      this.replaceSwitchStates([item.key, ...alsoOff.map((dependent) => dependent.key)], turnOn ? 'on' : 'off')
      void this.readAfterChange()
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

  /** when the power goes off by itself, with the buttons to keep it on; nothing when it will not go off */
  private renderAutoPowerOff(): TemplateResult | typeof nothing {
    const offAt = this.autoPowerOff?.off_at
    if (offAt === null || offAt === undefined) return nothing
    const remainingSeconds = Math.max(0, offAt - this.now() / MILLISECONDS_PER_SECOND)
    const minutes = Math.round(remainingSeconds / SECONDS_PER_MINUTE)
    return html`<div class="parameter-row auto-power-off" data-field="auto-power-off">
      <span class="muted"
        >Off at ${formatFinishTime(this.now(), remainingSeconds, this.timeZone)} (in ${minutes} min)</span
      >
      <button
        class="button"
        data-action="postpone-auto-power-off"
        @click=${() => this.changeAutoPowerOff(() => this.postponeAutoPowerOff(POSTPONE_MINUTES))}
      >
        Keep on 1 h
      </button>
      <button
        class="button"
        data-action="cancel-auto-power-off"
        @click=${() => this.changeAutoPowerOff(() => this.cancelAutoPowerOff())}
      >
        Cancel
      </button>
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
          ?disabled=${!SWITCHABLE_STATES.includes(this.power?.switch ?? '')}
          @click=${() => this.togglePower(!isOn)}
        >
          <span class="power-switch-knob"></span>
        </button>
      </div>
      ${this.renderAutoPowerOff()}`
  }

  /** the needed switch that is not on, which keeps this one off */
  private findMissingSwitch(item: HomeAssistantSwitch): HomeAssistantSwitch | undefined {
    const required = findRequiredSwitch(this.switches, item)
    return required && required.state !== 'on' ? required : undefined
  }

  private renderNeed(missing: HomeAssistantSwitch | undefined): TemplateResult | typeof nothing {
    if (!missing) return nothing
    return html`<span class="muted switch-need">needs ${missing.label}</span>`
  }

  private renderExtraSwitch(item: HomeAssistantSwitch): TemplateResult {
    const missing = this.findMissingSwitch(item)
    const isOn = !missing && item.state === 'on'
    return html`<div class="parameter-row">
        <span class="parameter-label" title=${item.description || nothing}>${item.label}</span>${this.renderNeed(
          missing,
        )}
        <button
          class="power-switch ${isOn ? 'on' : ''}"
          role="switch"
          aria-checked=${isOn ? 'true' : 'false'}
          aria-label=${item.label}
          data-switch=${item.key}
          ?disabled=${Boolean(missing) || !SWITCHABLE_STATES.includes(item.state)}
          @click=${() => this.toggleSwitch(item)}
        >
          <span class="power-switch-knob"></span>
        </button>
      </div>
      ${item.is_printer ? this.renderAutoPowerOff() : nothing}`
  }

  /** the printer power comes first, unless the list of switches places it */
  private renderSwitches(): TemplateResult {
    const printerRow = this.switches.some((item) => item.is_printer) ? nothing : this.renderPowerSwitch()
    return html`${printerRow} ${this.switches.map((item) => this.renderExtraSwitch(item))}`
  }

  private renderPower(): TemplateResult {
    return html`<div class="section">
      ${this.renderSectionHeader('Power & energy')}
      <div class="section-body">
        ${this.renderSwitches()}
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
    if (!(await this.confirmAction(CANCEL_QUESTION))) return
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
