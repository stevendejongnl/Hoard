import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { formatClockDuration } from '../print-job-metrics'

const NO_VALUE = '—'

function formatClock(seconds: number | null): string {
  return seconds === null ? NO_VALUE : formatClockDuration(seconds)
}

/** The strip under the temperature chart: time spent, a progress bar, the estimated total and the percentage. */
@customElement('print-timeline')
export class PrintTimeline extends LitElement {
  @property({ attribute: false }) spentSeconds: number | null = null
  @property({ attribute: false }) totalSeconds: number | null = null
  /** percent, 0 to 100 */
  @property({ attribute: false }) progress: number | null = null

  createRenderRoot() {
    return this
  }

  render(): TemplateResult {
    const progress = this.progress ?? 0
    return html`<div class="print-timeline">
      <span class="monospace muted timeline-spent">${formatClock(this.spentSeconds)}</span>
      <div
        class="timeline-bar"
        role="progressbar"
        aria-label="Print progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${Math.round(progress)}
      >
        <div class="timeline-fill" style="width: ${progress}%"></div>
      </div>
      <span class="monospace muted timeline-total">${formatClock(this.totalSeconds)}</span>
      <span class="monospace timeline-progress">${this.progress === null ? NO_VALUE : this.progress.toFixed(1)} %</span>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'print-timeline': PrintTimeline
  }
}
