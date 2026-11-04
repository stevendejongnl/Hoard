import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getMacros } from '../api'
import { ControlCard } from './control-card'

/** The macros of the printer, one button each. */
@customElement('control-macros-card')
export class ControlMacrosCard extends ControlCard {
  @property({ attribute: false }) loadMacros: () => Promise<string[]> = getMacros

  @state() private macros: string[] | null = null
  @state() private hasFailed = false

  connectedCallback(): void {
    super.connectedCallback()
    void this.load()
  }

  private async load(): Promise<void> {
    try {
      this.macros = await this.loadMacros()
      this.hasFailed = false
    } catch {
      this.hasFailed = true
    }
  }

  private renderBody(): TemplateResult {
    if (this.hasFailed) return html`<div class="muted control-empty">Could not read the macros</div>`
    if (this.macros?.length === 0) return html`<div class="muted control-empty">No macros</div>`
    return html`<div class="control-macro-list">
      ${(this.macros ?? []).map(
        (name) =>
          html`<button
            class="button control-macro"
            ?disabled=${this.locked}
            @click=${() => void this.command('macro', { name })}
          >
            ${name}
          </button>`,
      )}
    </div>`
  }

  render(): TemplateResult {
    return this.renderFrame('Macros', 'play', html`${this.renderBody()} ${this.renderLockNote()}`)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-macros-card': ControlMacrosCard
  }
}
