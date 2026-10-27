import { LitElement, svg } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getTemperatureHistory } from '../api'
import { buildTemperatureChart } from '../temperature-chart-geometry'
import type { TemperatureChartLayout, TemperatureSample } from '../temperature-chart-geometry'

type StopFunction = () => void
type ChartVariant = 'wide' | 'compact'

const REFRESH_MILLISECONDS = 5000
const LABEL_BASELINE_GAP = 4
const LABEL_LEFT_GAP = 6
const WINDOW_SECONDS = 600
const MAXIMUM_TEMPERATURE = 250

const DRAWINGS: Record<ChartVariant, { width: number; height: number; layout: TemperatureChartLayout }> = {
  wide: {
    width: 708,
    height: 190,
    layout: {
      left: 34,
      right: 700,
      bottom: 168,
      top: 8,
      labelBaseline: 184,
      maximumTemperature: MAXIMUM_TEMPERATURE,
      windowSeconds: WINDOW_SECONDS,
    },
  },
  compact: {
    width: 358,
    height: 150,
    layout: {
      left: 34,
      right: 350,
      bottom: 128,
      top: 8,
      labelBaseline: 144,
      maximumTemperature: MAXIMUM_TEMPERATURE,
      windowSeconds: WINDOW_SECONDS,
    },
  },
}

function repeatWithInterval(callback: () => void): StopFunction {
  const interval = setInterval(callback, REFRESH_MILLISECONDS)
  return () => clearInterval(interval)
}

function describeChart(samples: TemperatureSample[]): string {
  const latest = samples[samples.length - 1]
  const isOff = !latest || (latest.hotend_target === 0 && latest.bed_target === 0)
  const heaters = isOff
    ? 'heaters off'
    : `hotend heated to ${latest.hotend_target} degrees, bed to ${latest.bed_target} degrees`
  return `Temperature history, last 10 minutes: ${heaters}`
}

/** The last ten minutes of hotend and bed temperature, with their targets as dashed lines. */
@customElement('temperature-chart')
export class TemperatureChart extends LitElement {
  @property({ type: String }) variant: ChartVariant = 'wide'
  @property({ attribute: false }) loadHistory: () => Promise<TemperatureSample[]> = getTemperatureHistory
  @property({ attribute: false }) repeatEvery: (callback: () => void) => StopFunction = repeatWithInterval

  @state() private samples: TemperatureSample[] = []

  private stopRepeating: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.reload()
    this.stopRepeating = this.repeatEvery(() => void this.reload())
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopRepeating?.()
  }

  private async reload(): Promise<void> {
    try {
      this.samples = await this.loadHistory()
    } catch {
      this.samples = []
    }
  }

  private renderGridlines(drawing: (typeof DRAWINGS)[ChartVariant], chart: ReturnType<typeof buildTemperatureChart>) {
    const { left, right } = drawing.layout
    return chart.temperatureTicks.map(
      (
        tick,
      ) => svg`<line class="chart-gridline" x1=${left} x2=${right} y1=${tick.y.toFixed(1)} y2=${tick.y.toFixed(1)} stroke="#3E3E44" stroke-width="1"/>
        <text class="chart-temperature-label" x=${left - LABEL_LEFT_GAP} y=${(tick.y + LABEL_BASELINE_GAP).toFixed(1)} text-anchor="end" fill="#9A9AA3" font-size="11" font-family="JetBrains Mono, monospace">${tick.label}</text>`,
    )
  }

  private renderTimeLabels(drawing: (typeof DRAWINGS)[ChartVariant], chart: ReturnType<typeof buildTemperatureChart>) {
    return chart.timeTicks.map(
      (tick) =>
        svg`<text class="chart-time-label" x=${tick.x.toFixed(1)} y=${drawing.layout.labelBaseline} text-anchor=${tick.anchor} fill="#9A9AA3" font-size="11" font-family="JetBrains Mono, monospace">${tick.label}</text>`,
    )
  }

  private renderLine(className: string, points: string, color: string, isTarget: boolean): TemplateResult | string {
    if (points === '') return ''
    return isTarget
      ? svg`<polyline class="${className} target-line" points=${points} fill="none" stroke=${color} stroke-width="1.5" stroke-dasharray="4 3" opacity=".7"/>`
      : svg`<polyline class=${className} points=${points} fill="none" stroke=${color} stroke-width="2" stroke-linejoin="round"/>`
  }

  render() {
    const drawing = DRAWINGS[this.variant]
    const chart = buildTemperatureChart(this.samples, drawing.layout)
    return svg`<svg viewBox="0 0 ${drawing.width} ${drawing.height}" width="100%" role="img" aria-label=${describeChart(this.samples)} style="display: block">
      ${this.renderGridlines(drawing, chart)} ${this.renderTimeLabels(drawing, chart)}
      ${this.renderLine('hotend-target-line', chart.hotendTargetLine, '#FFD54F', true)}
      ${this.renderLine('bed-target-line', chart.bedTargetLine, '#64B5F6', true)}
      ${this.renderLine('bed-line', chart.bedLine, '#64B5F6', false)}
      ${this.renderLine('hotend-line', chart.hotendLine, '#FFD54F', false)}
    </svg>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'temperature-chart': TemperatureChart
  }
}
