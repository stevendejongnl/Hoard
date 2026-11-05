import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getMacros } from '../api'
import { renderIcon } from '../icons'
import type { Macro } from '../types'
import { ControlCard } from './control-card'

const OTHER_CATEGORY = 'Other'

interface MacroGroup {
  title: string
  macros: Macro[]
}

/** The macros in the order they come, grouped by category: the groups in the order of their first macro. */
function groupMacros(macros: Macro[]): MacroGroup[] {
  const groups = new Map<string, Macro[]>()
  for (const macro of macros) {
    const title = macro.category || OTHER_CATEGORY
    groups.set(title, [...(groups.get(title) ?? []), macro])
  }
  return [...groups].map(([title, members]) => ({ title, macros: members }))
}

/** The macros of the printer, in the categories of Fluidd: a row for each, with what it does and a button to run it. */
@customElement('control-macros-card')
export class ControlMacrosCard extends ControlCard {
  @property({ attribute: false }) loadMacros: () => Promise<Macro[]> = getMacros

  @state() private macros: Macro[] | null = null
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

  private renderRow(macro: Macro): TemplateResult {
    return html`<div class="control-macro-row">
      <div class="control-macro-text">
        <span class="control-macro-name monospace">${macro.name}</span>
        ${macro.description ? html`<span class="control-macro-description muted">${macro.description}</span>` : ''}
      </div>
      <button
        class="button control-macro-run"
        aria-label="Run ${macro.name}"
        ?disabled=${this.locked}
        @click=${() => void this.command('macro', { name: macro.name })}
      >
        ${renderIcon('play', 14)}Run
      </button>
    </div>`
  }

  private renderGroup(group: MacroGroup, hasTitles: boolean): TemplateResult {
    return html`<div class="control-macro-group">
      ${hasTitles ? html`<div class="control-macro-group-title">${group.title}</div>` : ''}
      ${group.macros.map((macro) => this.renderRow(macro))}
    </div>`
  }

  private renderBody(): TemplateResult {
    if (this.hasFailed) return html`<div class="muted control-empty">Could not read the macros</div>`
    if (this.macros?.length === 0) return html`<div class="muted control-empty">No macros</div>`
    const groups = groupMacros(this.macros ?? [])
    const hasTitles = (this.macros ?? []).some((macro) => macro.category)
    return html`<div class="control-macro-list">${groups.map((group) => this.renderGroup(group, hasTitles))}</div>`
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
