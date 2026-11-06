import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { HttpError, getControlStatus, getPendingConfig, getProbeOffset, sendControlCommand } from '../api'
import { renderIcon } from '../icons'
import '../styles/control.css'
import type { ControlStatus, PendingChange, PendingConfig, ProbeOffset } from '../types'
import './camera-panel'
import { openConfigSaveDialog } from './config-save-dialog'

const STEPS = [1, 0.1, 0.05]
const STEP_NAMES = ['Prepare', 'Measure', 'Review', 'Save']
const COOL_BELOW_CELSIUS = 60
const POLL_MILLISECONDS = 1000
const START_ATTEMPTS = 20
const GENERAL_FAILURE = 'Could not send the command'

type Phase = 'loading' | 'unavailable' | 'prepare' | 'starting' | 'measure' | 'review'

const sleepForReal = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
const formatMillimeters = (value: number | string): string => `${Number(value).toFixed(3)} mm`

function formatChange(difference: number): string {
  return `${difference > 0 ? '+' : ''}${difference.toFixed(3)} mm`
}

function readFailure(error: unknown): string {
  return error instanceof HttpError && error.detail ? error.detail : GENERAL_FAILURE
}

/** Measures the offset between the probe and the nozzle with a sheet of paper, one step at a time. */
@customElement('probe-offset-dialog')
export class ProbeOffsetDialog extends LitElement {
  @property({ attribute: false }) loadStatus: () => Promise<ControlStatus> = getControlStatus
  @property({ attribute: false }) loadProbeOffset: () => Promise<ProbeOffset> = getProbeOffset
  @property({ attribute: false }) loadPending: () => Promise<PendingConfig> = getPendingConfig
  @property({ attribute: false }) send: (route: string, body: object) => Promise<unknown> = sendControlCommand
  @property({ attribute: false }) sleep: (milliseconds: number) => Promise<void> = sleepForReal
  @property({ attribute: false }) close: () => void = () => this.remove()
  @property({ attribute: false }) openSaveDialog: () => void = openConfigSaveDialog
  /** the camera next to the keys, so the nozzle can be watched while it moves */
  @property({ attribute: false }) renderCamera: () => TemplateResult | typeof nothing = () =>
    html`<camera-panel></camera-panel>`

  @state() private phase: Phase = 'loading'
  @state() private status: ControlStatus | null = null
  @state() private probeOffset: ProbeOffset = { section: null, z_offset: null }
  @state() private change: PendingChange | null = null
  @state() private message = ''

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isClosable()) this.close()
  }

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    window.addEventListener('keydown', this.handleKeydown)
    void this.readPrinter()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('keydown', this.handleKeydown)
  }

  private isClosable(): boolean {
    return this.phase !== 'starting' && this.phase !== 'measure'
  }

  private async readPrinter(): Promise<void> {
    try {
      const [status, probeOffset] = await Promise.all([this.loadStatus(), this.loadProbeOffset()])
      this.status = status
      this.probeOffset = probeOffset
      this.phase = 'prepare'
    } catch (error) {
      this.message = readFailure(error)
      this.phase = 'unavailable'
    }
  }

  private isIdle(): boolean {
    return this.status !== null && this.status.state !== 'printing' && this.status.state !== 'paused'
  }

  private isHomed(): boolean {
    return ['x', 'y', 'z'].every((axis) => this.status?.homed.includes(axis))
  }

  private findNozzleTemperature(): number {
    return this.status?.heaters.find((heater) => heater.key === 'extruder')?.temperature ?? 0
  }

  private async sendAll(commands: [string, object][]): Promise<boolean> {
    try {
      for (const [route, body] of commands) await this.send(route, body)
    } catch (error) {
      this.message = readFailure(error)
      return false
    }
    this.message = ''
    return true
  }

  private async start(): Promise<void> {
    this.phase = 'starting'
    const commands: [string, object][] = this.isHomed() ? [] : [['home', { axes: [] }]]
    commands.push(['calibrate/probe_calibrate', {}])
    if (!(await this.sendAll(commands))) {
      this.phase = 'prepare'
      return
    }
    await this.waitForProbe()
  }

  private async waitForProbe(): Promise<void> {
    for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
      this.status = await this.loadStatus()
      if (this.status.manual_probe.active) {
        this.phase = 'measure'
        void this.watchProbe()
        return
      }
      await this.sleep(POLL_MILLISECONDS)
    }
    this.message = 'The probe calibration did not start'
    this.phase = 'prepare'
  }

  private async watchProbe(): Promise<void> {
    while (this.phase === 'measure' && this.isConnected) {
      await this.sleep(POLL_MILLISECONDS)
      if (this.phase !== 'measure') return
      try {
        this.status = await this.loadStatus()
      } catch {
        // the next reading tries again
      }
    }
  }

  private async moveProbe(direction: 'up' | 'down', step: number): Promise<void> {
    if (!(await this.sendAll([['probe', { direction, step }]]))) return
    this.status = await this.loadStatus()
  }

  private async accept(): Promise<void> {
    if (!(await this.sendAll([['calibrate/accept', {}]]))) return
    await this.readReview()
  }

  private async applyBabystep(): Promise<void> {
    if (!(await this.sendAll([['calibrate/apply_probe_offset', {}]]))) return
    await this.readReview()
  }

  private async abort(): Promise<void> {
    if (!(await this.sendAll([['calibrate/abort', {}]]))) return
    this.close()
  }

  private async readReview(): Promise<void> {
    try {
      const pending = await this.loadPending()
      this.change = pending.changes.find((change) => change.key === 'z_offset') ?? null
    } catch (error) {
      this.message = readFailure(error)
      this.change = null
    }
    this.phase = 'review'
  }

  private continueToSave(): void {
    this.close()
    this.openSaveDialog()
  }

  private renderStepBar(): TemplateResult {
    const current = this.phase === 'review' ? 2 : this.phase === 'measure' ? 1 : 0
    return html`<ol class="probe-offset-steps" aria-label="Steps">
      ${STEP_NAMES.map(
        (name, index) =>
          html`<li class="probe-offset-step ${index < current ? 'done' : ''} ${index === current ? 'current' : ''}">
            <span class="probe-offset-step-number">${index + 1}</span>${name}
          </li>`,
      )}
    </ol>`
  }

  private renderCheck(isGood: boolean, good: string, bad: string, note = ''): TemplateResult {
    return html`<div class="probe-offset-check ${isGood ? 'good' : 'bad'}">
      <span class="guided-dialog-dot"></span>${isGood ? good : bad}<span class="muted monospace guided-dialog-note"
        >${note}</span
      >
    </div>`
  }

  private renderValue(label: string, value: string, explanation = ''): TemplateResult {
    return html`<div class="probe-offset-value">
      <span class="control-label">${label}</span><span class="monospace probe-offset-number">${value}</span>
      <span class="muted">${explanation}</span>
    </div>`
  }

  private renderChecks(): TemplateResult {
    const temperature = this.findNozzleTemperature()
    const homedNote = this.isHomed() ? '' : 'will home first'
    return html`<div class="probe-offset-checks">
      ${this.renderCheck(this.isIdle(), 'Printer is idle', 'Printer is printing')}
      ${this.renderCheck(
        temperature < COOL_BELOW_CELSIUS,
        'Nozzle is cool',
        'Nozzle is hot',
        `${Math.round(temperature)} °C`,
      )}
      ${this.renderCheck(this.isHomed(), 'Printer is homed', 'Printer is not homed', homedNote)}
    </div>`
  }

  private renderOffsets(): TemplateResult {
    const probe = this.probeOffset.z_offset
    return html`<div class="probe-offset-values">
      ${this.renderValue(
        'Probe offset (printer.cfg)',
        probe === null ? 'not set' : formatMillimeters(probe),
        'The value you are about to change.',
      )}
      ${this.renderValue(
        'G-code offset (babystep)',
        formatMillimeters(this.status?.z_offset ?? 0),
        'Temporary. Gone after a restart. Not touched by the measuring.',
      )}
    </div>`
  }

  private renderApplyBabystep(): TemplateResult | typeof nothing {
    if ((this.status?.z_offset ?? 0) === 0) return nothing
    return html`<button
      class="button probe-offset-apply"
      ?disabled=${!this.isIdle()}
      @click=${() => void this.applyBabystep()}
    >
      Apply the babystep to the probe offset
    </button>`
  }

  private renderPrepare(): TemplateResult {
    return html`${this.renderChecks()} ${this.renderOffsets()}
      <div class="muted guided-dialog-hint">You need a sheet of paper. Nothing is saved until the last step.</div>
      ${this.renderApplyBabystep()}`
  }

  private renderKeys(direction: 'up' | 'down'): TemplateResult[] {
    const label = direction === 'up' ? 'Raise' : 'Lower'
    return STEPS.map(
      (step) =>
        html`<button
          class="control-key probe-offset-key"
          aria-label="${label} ${step} mm"
          @click=${() => void this.moveProbe(direction, step)}
        >
          ${renderIcon(direction === 'up' ? 'arrow-up' : 'arrow-down', 16)}<span>${step}</span>
        </button>`,
    )
  }

  private renderMeasure(): TemplateResult {
    const height = this.status?.manual_probe.z
    return html`<div class="probe-offset-measure">
      <div class="probe-offset-controls">
        <div class="probe-offset-value">
          <span class="control-label">Nozzle height above bed</span>
          <span class="monospace probe-offset-height"
            >${height === null || height === undefined ? '?' : height.toFixed(2)} mm</span
          >
        </div>
        <span class="control-label">Raise</span>
        <div class="probe-offset-keys">${this.renderKeys('up')}</div>
        <span class="control-label">Lower</span>
        <div class="probe-offset-keys">${this.renderKeys('down')}</div>
      </div>
      <div class="probe-offset-side">
        <div class="probe-offset-camera">${this.renderCamera()}</div>
        <div class="muted probe-offset-instruction">
          Slide the paper under the nozzle. Lower in small steps until the paper drags a little when you pull it. Then
          accept.
        </div>
      </div>
    </div>`
  }

  private renderReview(): TemplateResult {
    const change = this.change
    if (!change) {
      return html`<div class="guided-dialog-warning error" role="alert">
        ${renderIcon('alert', 16)}<span>No new offset was found. Measure again.</span>
      </div>`
    }
    const old = this.probeOffset.z_offset
    const difference = Number(change.new) - Number(old ?? change.new)
    return html`<div class="probe-offset-values">
        ${this.renderValue('Old probe offset', old === null ? 'not set' : formatMillimeters(old))}
        ${this.renderValue('New probe offset', formatMillimeters(change.new))}
      </div>
      <div class="probe-offset-change">
        <span>Change</span><span class="monospace">${formatChange(difference)}</span>
      </div>
      <div class="guided-dialog-warning" role="note">
        ${renderIcon('alert', 16)}<span
          >Not saved yet. The new value is lost when Klipper restarts. Continue to save it to printer.cfg.</span
        >
      </div>`
  }

  private renderBody(): TemplateResult {
    switch (this.phase) {
      case 'loading':
        return html`<div class="muted">Reading the printer</div>`
      case 'unavailable':
        return html`<div class="control-card-failure" role="alert">${this.message}</div>`
      case 'starting':
        return html`<div class="muted">Starting the probe calibration</div>`
      case 'measure':
        return this.renderMeasure()
      case 'review':
        return this.renderReview()
      case 'prepare':
        return this.renderPrepare()
    }
  }

  private renderFooter(): TemplateResult {
    switch (this.phase) {
      case 'measure':
        return html`<button class="button danger" @click=${() => void this.abort()}>Abort</button>
          <span class="muted">Abort keeps the old offset.</span><span class="guided-dialog-spacer"></span>
          <button class="button primary" @click=${() => void this.accept()}>Accept this height</button>`
      case 'review':
        return html`<button class="button" @click=${() => void this.start()}>Measure again</button>
          <span class="guided-dialog-spacer"></span
          ><button class="button" @click=${() => this.close()}>Not now</button> ${this.change
            ? html`<button class="button primary" @click=${() => this.continueToSave()}>Continue to save</button>`
            : nothing}`
      default:
        return html`<button class="button" ?disabled=${!this.isClosable()} @click=${() => this.close()}>Cancel</button>
          <span class="guided-dialog-spacer"></span>
          ${this.phase === 'prepare'
            ? html`<button class="button primary" ?disabled=${!this.isIdle()} @click=${() => void this.start()}>
                ${this.isHomed() ? 'Start calibration' : 'Home and start'}
              </button>`
            : nothing}`
    }
  }

  render(): TemplateResult {
    return html`<div class="guided-dialog-overlay" @click=${() => this.isClosable() && this.close()}>
      <div
        class="guided-dialog-modal probe-offset-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Probe offset"
        @click=${(event: Event) => event.stopPropagation()}
      >
        <div class="guided-dialog-header">
          <span class="guided-dialog-title">Probe offset</span>
        </div>
        ${this.renderStepBar()}
        <div class="guided-dialog-body">
          ${this.renderBody()}
          ${this.message && this.phase !== 'unavailable'
            ? html`<div class="control-card-failure" role="alert">${this.message}</div>`
            : nothing}
        </div>
        <div class="guided-dialog-footer">${this.renderFooter()}</div>
      </div>
    </div>`
  }
}

/** Shows the dialog on the page; it is gone when it closes. */
export function openProbeOffsetDialog(): void {
  const dialog = document.createElement('probe-offset-dialog')
  dialog.close = () => dialog.remove()
  document.body.appendChild(dialog)
}

declare global {
  interface HTMLElementTagNameMap {
    'probe-offset-dialog': ProbeOffsetDialog
  }
}
