import { html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getConsole } from '../api'
import { renderIcon } from '../icons'
import { parseScrewsTilt } from '../screws-tilt'
import type { ScrewAdvice } from '../screws-tilt'
import type { ConsoleLine } from '../types'
import { openConfigSaveDialog } from './config-save-dialog'
import { ControlCard } from './control-card'

const PROBE_STEPS = [0.01, 0.05, 0.1, 0.5]
const LEVEL = '00:00'

function describeAdvice(screw: ScrewAdvice): string {
  if (screw.isBase) return 'base'
  return screw.turn === LEVEL ? 'level' : `${screw.direction} ${screw.turn}`
}

/** The ways to calibrate: the bed mesh, the screws of the bed, and a probe that is moved by hand. */
@customElement('control-calibration-card')
export class ControlCalibrationCard extends ControlCard {
  @property({ attribute: false }) loadLines: () => Promise<ConsoleLine[]> = getConsole
  @property({ attribute: false }) openSaveDialog: () => void = openConfigSaveDialog

  @state() private probeStep = 0.1
  @state() private screws: ScrewAdvice[] = []

  connectedCallback(): void {
    super.connectedCallback()
    void this.readScrews()
  }

  private async readScrews(): Promise<void> {
    try {
      this.screws = parseScrewsTilt(await this.loadLines())
    } catch {
      this.screws = []
    }
  }

  private async adjustScrews(): Promise<void> {
    await this.command('calibrate/screws_tilt')
    await this.readScrews()
  }

  private renderStart(label: string, onPress: () => void): TemplateResult {
    return html`<button class="button control-wide-button" ?disabled=${this.locked} @click=${onPress}>${label}</button>`
  }

  private renderProbeKey(label: string, icon: 'arrow-up' | 'arrow-down', direction: 'up' | 'down'): TemplateResult {
    return html`<button
      class="control-key"
      aria-label=${label}
      ?disabled=${this.locked}
      @click=${() => void this.command('probe', { direction, step: this.probeStep })}
    >
      ${renderIcon(icon, 18)}
    </button>`
  }

  private renderProbeSteps(): TemplateResult {
    return html`<div class="control-chips">
      ${PROBE_STEPS.map(
        (step) =>
          html`<button
            class="control-chip"
            aria-pressed=${this.probeStep === step ? 'true' : 'false'}
            @click=${() => (this.probeStep = step)}
          >
            ${step}
          </button>`,
      )}
    </div>`
  }

  private renderProbePanel(): TemplateResult | typeof nothing {
    const probe = this.status?.manual_probe
    if (!probe?.active) return nothing
    return html`<div class="control-probe-panel">
      <span class="control-label">Probe height</span>
      <span class="monospace control-probe-height">Z ${probe.z?.toFixed(2) ?? '?'} mm</span>
      ${this.renderProbeSteps()}
      <div class="control-button-row">
        ${this.renderProbeKey('Probe down', 'arrow-down', 'down')} ${this.renderProbeKey('Probe up', 'arrow-up', 'up')}
        <button class="button" @click=${() => void this.command('calibrate/accept')}>Accept</button>
        <button class="button danger" @click=${() => void this.command('calibrate/abort')}>Abort</button>
      </div>
    </div>`
  }

  private renderScrews(): TemplateResult {
    if (this.screws.length === 0) {
      return html`<div class="muted control-empty">Run the screws tilt adjust to see how far to turn each screw</div>`
    }
    return html`<div class="control-screws">
      ${this.screws.map(
        (screw) =>
          html`<div class="control-screw-row">
            <span>${screw.name}</span><span class="monospace">${describeAdvice(screw)}</span>
          </div>`,
      )}
    </div>`
  }

  render(): TemplateResult {
    return this.renderFrame(
      'Calibration',
      'crosshair',
      html`<div class="control-button-row">
          ${this.renderStart('Calibrate bed mesh', () => void this.command('calibrate/bed_mesh'))}
          ${this.renderStart('Screws tilt adjust', () => void this.adjustScrews())}
          ${this.renderStart('Manual probe', () => void this.command('calibrate/manual_probe'))}
        </div>
        <div class="control-button-row">${this.renderStart('Save config', () => this.openSaveDialog())}</div>
        ${this.renderProbePanel()} ${this.renderScrews()} ${this.renderLockNote()}`,
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-calibration-card': ControlCalibrationCard
  }
}
