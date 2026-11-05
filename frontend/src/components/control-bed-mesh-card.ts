import { html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getBedMesh } from '../api'
import { renderIcon } from '../icons'
import type { BedMesh } from '../types'
import { ControlCard } from './control-card'

const LOW_HUE = 205
const HIGH_HUE = 320
const SATURATION = 60
const LIGHTNESS_FLOOR = 36
const LIGHTNESS_SPAN = 26

function formatHeight(value: number): string {
  return `${value < 0 ? '-' : '+'}${Math.abs(value).toFixed(2)}`
}

function pickColor(value: number, lowest: number, highest: number): string {
  const share = highest === lowest ? 0.5 : (value - lowest) / (highest - lowest)
  const hue = value < 0 ? LOW_HUE : HIGH_HUE
  return `hsl(${hue}, ${SATURATION}%, ${LIGHTNESS_FLOOR + LIGHTNESS_SPAN * share}%)`
}

function describeDirection(value: number): string {
  if (value < 0) return 'low'
  return value > 0 ? 'high' : ''
}

/** The heights of the bed mesh the printer holds, as a grid: blue where the bed is low, pink where it is high. */
@customElement('control-bed-mesh-card')
export class ControlBedMeshCard extends ControlCard {
  @property({ attribute: false }) loadMesh: () => Promise<BedMesh> = getBedMesh

  @state() private mesh: BedMesh | null = null
  @state() private hasFailed = false

  connectedCallback(): void {
    super.connectedCallback()
    void this.load()
  }

  private async load(): Promise<void> {
    try {
      this.mesh = await this.loadMesh()
      this.hasFailed = false
    } catch {
      this.hasFailed = true
    }
  }

  private renderCells(matrix: number[][]): TemplateResult {
    const values = matrix.flat()
    const lowest = Math.min(...values)
    const highest = Math.max(...values)
    return html`<div class="control-mesh-grid" style="grid-template-columns: repeat(${matrix[0].length}, 1fr)">
        ${values.map(
          (value) =>
            html`<span
              class="control-mesh-cell ${describeDirection(value)}"
              style="background: ${pickColor(value, lowest, highest)}"
              >${formatHeight(value)}</span
            >`,
        )}
      </div>
      <div class="muted monospace control-mesh-range">Range ${(highest - lowest).toFixed(2)} mm</div>`
  }

  private renderBody(): TemplateResult {
    if (this.hasFailed) return html`<div class="muted control-empty">Could not read the bed mesh</div>`
    const matrix = this.mesh?.probed_matrix ?? []
    if (matrix.flat().length === 0) return html`<div class="muted control-empty">No bed mesh loaded</div>`
    return this.renderCells(matrix)
  }

  render(): TemplateResult {
    const reload = html`<button
      class="button flat icon-only control-card-action"
      aria-label="Reload the bed mesh"
      @click=${() => void this.load()}
    >
      ${renderIcon('refresh', 16)}
    </button>`
    const profile = this.mesh?.profile_name ? html`${this.mesh.profile_name}` : nothing
    return this.renderFrame('Bed mesh', 'grid', this.renderBody(), html`${profile}${reload}`)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-bed-mesh-card': ControlBedMeshCard
  }
}
