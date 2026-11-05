import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { ControlCard } from './control-card'

const LENGTHS = [5, 10, 25, 50]
const SPEEDS = [2, 5, 10]
const SECONDS_PER_MINUTE = 60

/** Pushes filament through or pulls it back, a length at a time, and loads and unloads it. */
@customElement('control-extruder-card')
export class ControlExtruderCard extends ControlCard {
  @state() private length = 10
  @state() private speed = 5

  private extrude(direction: 1 | -1): void {
    void this.command('extrude', { length: this.length * direction, speed: this.speed * SECONDS_PER_MINUTE })
  }

  private renderChoice(
    group: string,
    label: string,
    values: number[],
    chosen: number,
    choose: (value: number) => void,
  ) {
    return html`<div class="control-chips" data-group=${group}>
      <span class="control-label control-chips-label">${label}</span>
      ${values.map(
        (value) =>
          html`<button
            class="control-chip"
            aria-pressed=${chosen === value ? 'true' : 'false'}
            @click=${() => choose(value)}
          >
            ${value}
          </button>`,
      )}
    </div>`
  }

  private renderAction(label: string, onPress: () => void): TemplateResult {
    return html`<button class="button control-wide-button" ?disabled=${this.locked} @click=${onPress}>${label}</button>`
  }

  render(): TemplateResult {
    return this.renderFrame(
      'Extruder',
      'extruder',
      html`${this.renderChoice('length', 'Length (mm)', LENGTHS, this.length, (value) => (this.length = value))}
        ${this.renderChoice('speed', 'Speed (mm/s)', SPEEDS, this.speed, (value) => (this.speed = value))}
        <div class="control-button-row">
          ${this.renderAction('Retract', () => this.extrude(-1))} ${this.renderAction('Extrude', () => this.extrude(1))}
        </div>
        ${this.renderLockNote()}`,
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-extruder-card': ControlExtruderCard
  }
}
