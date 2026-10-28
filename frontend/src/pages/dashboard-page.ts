import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getFileMetadata } from '../api'
import { sseClient } from '../sse'
import type { GcodeFile, PiStats, Power, PrinterState, Temps } from '../types'
import '../components/camera-panel'
import '../components/cost-predictor-panel'
import '../components/dashboard-lists-panel'
import '../components/file-browser-modal'
import '../components/phone-print-summary'
import '../components/phone-temperature-section'
import '../components/print-ready-modal'
import '../components/print-timeline'
import '../components/printer-parameter-panel'
import '../components/temperature-chart'
import '../styles/dashboard.css'

type StopFunction = () => void
type UpdatePayload = { type: string; data: unknown }
type BrowserPurpose = 'print' | 'predict'

const PHONE_QUERY = '(max-width: 800px)'

function checkPhoneLayout(): boolean {
  return window.matchMedia?.(PHONE_QUERY).matches ?? false
}

/** The overview of the printer: what it is doing now, how it is heating, what the camera sees and the latest prints. */
@customElement('dashboard-page')
export class DashboardPage extends LitElement {
  @property({ attribute: false }) subscribeToUpdates: (handler: (payload: UpdatePayload) => void) => StopFunction = (
    handler,
  ) => sseClient.subscribe(handler)
  @property({ attribute: false }) loadFileMetadata: (filename: string) => Promise<GcodeFile> = getFileMetadata
  @property({ attribute: false }) isPhoneLayout: () => boolean = checkPhoneLayout
  @property({ attribute: false }) now: () => number = () => Date.now()
  @property({ type: String }) timeZone: string | undefined = undefined
  @property({ attribute: false }) startPrint: (filename: string) => void = (filename) =>
    document.querySelector<HTMLElement & { tryPrint(name: string): void }>('print-ready-modal')?.tryPrint(filename)

  @state() private printerState: PrinterState | null = null
  @state() private temperatures: Temps | null = null
  @state() private power: Power | null = null
  @state() private piStats: PiStats | null = null
  @state() private estimatedSeconds: number | null = null
  @state() private filamentWeightGrams: number | null = null
  @state() private browserPurpose: BrowserPurpose | null = null
  @state() private browserSelection: string | null = null

  private stopListening: StopFunction | null = null
  private requestedFilename = ''

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.stopListening = this.subscribeToUpdates((payload) => this.receive(payload))
    this.addEventListener('open-file-browser', this.openBrowser)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopListening?.()
    this.removeEventListener('open-file-browser', this.openBrowser)
  }

  private openBrowser = (event: Event): void => {
    this.browserPurpose = (event as CustomEvent<{ purpose: BrowserPurpose }>).detail.purpose
    const predictor = this.querySelector<HTMLElement & { currentFilename: string }>('cost-predictor-panel')
    this.browserSelection = this.browserPurpose === 'predict' ? (predictor?.currentFilename ?? null) : null
  }

  private handleFileChosen(event: Event): void {
    const filename = (event as CustomEvent<{ filename: string }>).detail.filename
    if (this.browserPurpose === 'print') this.startPrint(filename)
    if (this.browserPurpose === 'predict') {
      const predictor = this.querySelector<HTMLElement & { chooseFile(name: string): Promise<void> }>(
        'cost-predictor-panel',
      )
      void predictor?.chooseFile(filename)
    }
  }

  private receive(payload: UpdatePayload): void {
    if (payload.type === 'printer_state') this.receivePrinterState(payload.data as PrinterState)
    if (payload.type === 'temps') this.temperatures = payload.data as Temps
    if (payload.type === 'power') this.power = payload.data as Power
    if (payload.type === 'pi_stats') this.piStats = payload.data as PiStats
  }

  private receivePrinterState(printerState: PrinterState): void {
    this.printerState = printerState
    void this.loadEstimateOnce(printerState.filename)
  }

  private async loadEstimateOnce(filename: string): Promise<void> {
    if (!filename || filename === this.requestedFilename) return
    this.requestedFilename = filename
    this.estimatedSeconds = null
    this.filamentWeightGrams = null
    try {
      const metadata = await this.loadFileMetadata(filename)
      this.estimatedSeconds = metadata.estimated_time ?? null
      this.filamentWeightGrams = metadata.filament_weight_total ?? null
    } catch {
      this.estimatedSeconds = null
    }
  }

  private isPrintActive(): boolean {
    return this.printerState?.state === 'printing' || this.printerState?.state === 'paused'
  }

  private renderChartHeader(): TemplateResult {
    return html`<div class="section-header chart-header">
      <span class="chart-title">Temperature</span>
      <span class="chart-legend actions">
        <span class="monospace legend-item"><span class="legend-line hotend-color"></span>Hotend</span>
        <span class="monospace legend-item"><span class="legend-line bed-color"></span>Bed</span>
        <span class="muted legend-note">dashed = target</span>
      </span>
    </div>`
  }

  private renderTimeline(): TemplateResult {
    const isActive = this.isPrintActive()
    return html`<print-timeline
      .spentSeconds=${isActive ? (this.printerState?.time_remaining ?? null) : null}
      .totalSeconds=${isActive ? this.estimatedSeconds : null}
      .progress=${isActive ? (this.printerState?.progress ?? null) : null}
    ></print-timeline>`
  }

  private renderDesktop(): TemplateResult {
    return html`<div class="dashboard-layout">
      <aside class="dashboard-parameters" aria-label="Parameters">
        <printer-parameter-panel
          .printerState=${this.printerState}
          .temperatures=${this.temperatures}
          .power=${this.power}
          .piStats=${this.piStats}
          .estimatedSeconds=${this.estimatedSeconds}
          .now=${this.now}
          .timeZone=${this.timeZone}
        ></printer-parameter-panel>
      </aside>
      <section class="dashboard-main" aria-label="Main">
        <camera-panel></camera-panel>
        <div class="chart-block">
          ${this.renderChartHeader()}
          <div class="chart-body"><temperature-chart></temperature-chart></div>
        </div>
        ${this.renderTimeline()}
      </section>
      <aside class="dashboard-side" aria-label="Details">
        <dashboard-lists-panel
          .printerState=${this.printerState}
          .currentPrintWeightGrams=${this.filamentWeightGrams}
        ></dashboard-lists-panel>
        <cost-predictor-panel></cost-predictor-panel>
      </aside>
    </div>`
  }

  private renderPhone(): TemplateResult {
    return html`<div class="dashboard-phone">
      <phone-print-summary
        .printerState=${this.printerState}
        .estimatedSeconds=${this.estimatedSeconds}
        .now=${this.now}
        .timeZone=${this.timeZone}
      ></phone-print-summary>
      <phone-temperature-section .temperatures=${this.temperatures} .power=${this.power}></phone-temperature-section>
      <camera-panel></camera-panel>
    </div>`
  }

  render(): TemplateResult {
    return html`<print-ready-modal></print-ready-modal>
      <file-browser-modal
        ?open=${this.browserPurpose !== null}
        .initialSelection=${this.browserSelection}
        @file-selected=${this.handleFileChosen}
        @close=${() => (this.browserPurpose = null)}
      ></file-browser-modal
      >${this.isPhoneLayout() ? this.renderPhone() : this.renderDesktop()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dashboard-page': DashboardPage
  }
}
