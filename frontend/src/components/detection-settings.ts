import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getDetection, saveDetectionSettings } from '../api'
import { renderIcon } from '../icons'
import type { DetectionAction, DetectionSettings, DetectionStatus, ThresholdSuggestion } from '../types'
import '../styles/detection.css'

type SaveMessage = '' | 'saved' | 'failed'

const PERCENT = 100
const SAVE_PAUSE_MILLISECONDS = 600

/** Runs `callback` once the pause is over, and returns a way to take it back. */
function waitForPause(callback: () => void): () => void {
  const timer = setTimeout(callback, SAVE_PAUSE_MILLISECONDS)
  return () => clearTimeout(timer)
}

/** What the form edits: the same as the settings, but with the limit as a whole percent. */
interface Draft {
  enabled: boolean
  limitPercent: number
  interval_seconds: number
  window_size: number
  required_frames: number
  action: DetectionAction
}

function createDraft(settings: DetectionSettings): Draft {
  return {
    enabled: settings.enabled,
    limitPercent: Math.round(settings.threshold * PERCENT),
    interval_seconds: settings.interval_seconds,
    window_size: settings.window_size,
    required_frames: settings.required_frames,
    action: settings.action,
  }
}

function createChanges(draft: Draft): DetectionSettings {
  return {
    enabled: draft.enabled,
    threshold: draft.limitPercent / PERCENT,
    interval_seconds: draft.interval_seconds,
    window_size: draft.window_size,
    required_frames: draft.required_frames,
    action: draft.action,
  }
}

/** The settings of print failure detection, on the system page. Nothing is shown while there is no detector. */
@customElement('detection-settings')
export class DetectionSettingsForm extends LitElement {
  @property({ attribute: false }) loadStatus: () => Promise<DetectionStatus> = getDetection
  @property({ attribute: false }) saveSettings: (changes: Partial<DetectionSettings>) => Promise<DetectionSettings> =
    saveDetectionSettings
  @property({ attribute: false }) scheduleSave: (callback: () => void) => () => void = waitForPause

  @state() private status: DetectionStatus | null = null
  @state() private draft: Draft | null = null
  @state() private message: SaveMessage = ''

  private cancelPendingSave: (() => void) | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.load()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    if (!this.cancelPendingSave) return
    this.cancelPendingSave()
    void this.save()
  }

  private async load(): Promise<void> {
    try {
      this.status = await this.loadStatus()
      this.draft = createDraft(this.status.settings)
    } catch {
      this.status = null
    }
  }

  protected willUpdate(): void {
    this.hidden = !this.status?.configured
  }

  private change(changes: Partial<Draft>): void {
    if (!this.draft) return
    this.draft = { ...this.draft, ...changes }
    this.message = ''
    this.cancelPendingSave?.()
    this.cancelPendingSave = this.scheduleSave(() => void this.save())
  }

  private async save(): Promise<void> {
    this.cancelPendingSave = null
    if (!this.draft) return
    try {
      await this.saveSettings(createChanges(this.draft))
      this.message = 'saved'
    } catch {
      this.message = 'failed'
    }
  }

  private renderNumber(name: keyof Draft, label: string, unit: string, value: number): TemplateResult {
    return html`<label class="detection-setting">
      <span class="parameter-label">${label}</span>
      <input
        class="value-field"
        type="number"
        data-field=${name === 'limitPercent' ? 'threshold' : name}
        .value=${String(value)}
        @input=${(event: Event) => this.change({ [name]: Number((event.target as HTMLInputElement).value) })}
      />
      <span class="muted">${unit}</span>
    </label>`
  }

  private renderEnabled(draft: Draft): TemplateResult {
    return html`<label class="detection-setting">
      <span class="parameter-label">Watch prints</span>
      <input
        type="checkbox"
        data-field="enabled"
        .checked=${draft.enabled}
        @change=${(event: Event) => this.change({ enabled: (event.target as HTMLInputElement).checked })}
      />
    </label>`
  }

  private renderAction(draft: Draft): TemplateResult {
    return html`<label class="detection-setting">
      <span class="parameter-label">When it looks failed</span>
      <select
        class="value-field select-field"
        data-field="action"
        .value=${draft.action}
        @change=${(event: Event) =>
          this.change({ action: (event.target as HTMLSelectElement).value as DetectionAction })}
      >
        <option value="notify">Notify me</option>
        <option value="pause">Pause the print and notify me</option>
      </select>
    </label>`
  }

  private renderSuggestion(suggestion: ThresholdSuggestion | null): TemplateResult | typeof nothing {
    if (!suggestion) return nothing
    const percent = Math.round(suggestion.threshold * PERCENT)
    return html`<div class="detection-suggestion">
      <span>Suggested limit <strong>${percent}%</strong></span>
      <span class="muted">${suggestion.reason}</span>
      <button class="button small" @click=${() => this.change({ limitPercent: percent })}>Use</button>
    </div>`
  }

  private renderPrivacyNote(framesLeaveNetwork: boolean): TemplateResult | typeof nothing {
    if (!framesLeaveNetwork) return nothing
    return html`<p class="muted detection-privacy">
      The camera image is sent to an outside service to be judged. Keep people out of its view.
    </p>`
  }

  private renderMessage(): TemplateResult | typeof nothing {
    if (this.message === 'saved') return html`<span class="detection-save-status">Saved</span>`
    if (this.message === 'failed') {
      return html`<span class="detection-save-status detection-banner-error">Could not save the settings</span>`
    }
    return nothing
  }

  render(): TemplateResult | typeof nothing {
    const draft = this.draft
    if (!this.status?.configured || !draft) return nothing
    return html`<section class="section detection-settings-section" aria-label="Failure detection">
      <div class="section-header">${renderIcon('chevron-down', 14, 2.4)}Failure detection ${this.renderMessage()}</div>
      <div class="section-body detection-settings-body">
        ${this.renderPrivacyNote(this.status.frames_leave_network)} ${this.renderEnabled(draft)}
        ${this.renderNumber('limitPercent', 'Limit', '%', draft.limitPercent)}
        ${this.renderNumber('interval_seconds', 'Look every', 'seconds', draft.interval_seconds)}
        ${this.renderNumber('required_frames', 'Frames that must look failed', '', draft.required_frames)}
        ${this.renderNumber('window_size', 'Out of the newest', 'frames', draft.window_size)}
        ${this.renderAction(draft)} ${this.renderSuggestion(this.status.suggestion)}
      </div>
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'detection-settings': DetectionSettingsForm
  }
}
