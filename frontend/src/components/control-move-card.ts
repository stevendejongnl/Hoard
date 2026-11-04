import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { renderIcon } from '../icons'
import type { IconName } from '../icons'
import { ControlCard } from './control-card'

type Axis = 'x' | 'y' | 'z'

const STEPS = [0.1, 1, 10, 50]
const Z_SPEED_MILLIMETRES_PER_MINUTE = 600
const HOME_BUTTONS: Array<{ label: string; axes: Axis[] }> = [
  { label: 'All', axes: [] },
  { label: 'X', axes: ['x'] },
  { label: 'Y', axes: ['y'] },
  { label: 'Z', axes: ['z'] },
]

function describePosition(position: { x: number; y: number; z: number } | undefined): string {
  if (!position) return 'Position unknown'
  return `X ${position.x.toFixed(1)}   Y ${position.y.toFixed(1)}   Z ${position.z.toFixed(2)}`
}

/** Jogs the head by a chosen step and homes the axes. */
@customElement('control-move-card')
export class ControlMoveCard extends ControlCard {
  @state() private step = 10

  private jog(axis: Axis, direction: 1 | -1): void {
    const distance = this.step * direction
    const body = axis === 'z' ? { axis, distance, speed: Z_SPEED_MILLIMETRES_PER_MINUTE } : { axis, distance }
    void this.command('move', body)
  }

  private renderKey(label: string, icon: IconName, onPress: () => void, className = ''): TemplateResult {
    return html`<button class="control-key ${className}" aria-label=${label} ?disabled=${this.locked} @click=${onPress}>
      ${renderIcon(icon, 18)}
    </button>`
  }

  private renderPad(): TemplateResult {
    return html`<div class="control-pad">
      <span></span>${this.renderKey('Y plus', 'arrow-up', () => this.jog('y', 1))}<span></span>
      ${this.renderKey('X minus', 'arrow-left', () => this.jog('x', -1))}
      ${this.renderKey('Home XY', 'home', () => void this.command('home', { axes: ['x', 'y'] }), 'home')}
      ${this.renderKey('X plus', 'arrow-right', () => this.jog('x', 1))}
      <span></span>${this.renderKey('Y minus', 'arrow-down', () => this.jog('y', -1))}<span></span>
    </div>`
  }

  private renderZColumn(): TemplateResult {
    return html`<div class="control-z-column">
      ${this.renderKey('Z up', 'arrow-up', () => this.jog('z', 1))}
      ${this.renderKey('Home Z', 'home', () => void this.command('home', { axes: ['z'] }), 'home')}
      ${this.renderKey('Z down', 'arrow-down', () => this.jog('z', -1))}
    </div>`
  }

  private renderSteps(): TemplateResult {
    return html`<div class="control-chips">
      ${STEPS.map(
        (step) =>
          html`<button
            class="control-chip"
            aria-pressed=${this.step === step ? 'true' : 'false'}
            @click=${() => (this.step = step)}
          >
            ${step}
          </button>`,
      )}
    </div>`
  }

  private renderHomeButtons(): TemplateResult {
    return html`<div class="control-chips">
      ${HOME_BUTTONS.map(
        (home) =>
          html`<button
            class="button"
            ?disabled=${this.locked}
            @click=${() => void this.command('home', home.axes.length ? { axes: home.axes } : {})}
          >
            ${home.label}
          </button>`,
      )}
    </div>`
  }

  render(): TemplateResult {
    return this.renderFrame(
      'Move and home',
      'move',
      html`<div class="control-move-layout">
          <div class="control-move-group"><span class="control-label">X / Y</span>${this.renderPad()}</div>
          <div class="control-move-group"><span class="control-label">Z</span>${this.renderZColumn()}</div>
          <div class="control-move-group control-move-options">
            <span class="control-label">Step (mm)</span>${this.renderSteps()}
            <span class="control-label">Home</span>${this.renderHomeButtons()}
          </div>
        </div>
        <div class="control-button-row">
          <button class="button" ?disabled=${this.locked} @click=${() => void this.command('gcode', { script: 'M84' })}>
            Motors off
          </button>
        </div>
        <div class="muted monospace control-position">${describePosition(this.status?.position)}</div>
        ${this.renderLockNote()}`,
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-move-card': ControlMoveCard
  }
}
