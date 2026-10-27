import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { Spool } from '../types'
import {
  createSpool as createSpoolRequest,
  deleteSpool as deleteSpoolRequest,
  getSpools,
  updateSpool as updateSpoolRequest,
} from '../api'
import { renderIcon } from '../icons'
import {
  buildSpoolName,
  calculateRemainingPercent,
  createFormFromSpool,
  filterSpools,
  formatCostPerGram,
  formatMaterialLabel,
  listMaterials,
  parseSpoolForm,
  summarizeSpools,
} from '../spool-list'
import type { ShowFilter, SpoolForm } from '../spool-list'
import { normalizeHexadecimalColor } from '../theme'
import '../styles/spools.css'

type LoadState = 'loading' | 'ready' | 'error'
type DeleteResponse = { ok: boolean; status: number }

const HAS_LINKED_PRINTS_STATUS = 409
const SECTION_CHEVRON_SIZE = 14
const SELECT_CHEVRON_SIZE = 12
const ICON_STROKE_WIDTH = 2.4

/** The spools of the printer: a filtered table, a summary and a form to edit the selected spool. */
@customElement('spools-page')
export class SpoolsPage extends LitElement {
  @property({ attribute: false }) loadSpools: () => Promise<Spool[]> = getSpools
  @property({ attribute: false }) createSpool: (data: Partial<Spool>) => Promise<Spool> = createSpoolRequest
  @property({ attribute: false }) updateSpool: (id: number, data: Partial<Spool>) => Promise<Spool> = updateSpoolRequest
  @property({ attribute: false }) deleteSpool: (id: number) => Promise<DeleteResponse> = deleteSpoolRequest
  @property({ attribute: false }) confirmAction: (message: string) => boolean = (message) => window.confirm(message)

  @state() private spools: Spool[] = []
  @state() private loadState: LoadState = 'loading'
  @state() private materialFilter = ''
  @state() private showFilter: ShowFilter = 'all'
  @state() private selectedSpoolId: number | null = null
  @state() private form: SpoolForm = createFormFromSpool(null)
  @state() private formError = ''
  @state() private isDetailsOpen = false

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.reload().then(() => this.selectFirstSpool())
  }

  private async reload(): Promise<void> {
    try {
      this.spools = await this.loadSpools()
      this.loadState = 'ready'
    } catch {
      this.loadState = 'error'
    }
  }

  private findSelectedSpool(): Spool | null {
    return this.spools.find((spool) => spool.id === this.selectedSpoolId) ?? null
  }

  private selectSpool(spool: Spool | null): void {
    this.selectedSpoolId = spool?.id ?? null
    this.form = createFormFromSpool(spool)
    this.formError = ''
  }

  private selectFirstSpool(): void {
    this.selectSpool(this.spools[0] ?? null)
  }

  private editSpool(spool: Spool): void {
    this.selectSpool(spool)
    this.isDetailsOpen = true
  }

  private startNewSpool(): void {
    this.selectSpool(null)
    this.isDetailsOpen = true
  }

  private closeDetails(): void {
    this.isDetailsOpen = false
  }

  private changeField(name: keyof SpoolForm, event: Event): void {
    const field = event.target as HTMLInputElement | HTMLTextAreaElement
    this.form = { ...this.form, [name]: field.value }
  }

  private async saveSpool(): Promise<void> {
    const result = parseSpoolForm(this.form)
    if (!result.isValid) {
      this.formError = result.message
      return
    }
    try {
      await this.sendSpool(result.payload)
    } catch {
      this.formError = 'Could not save the spool'
    }
  }

  private async sendSpool(payload: Partial<Spool>): Promise<void> {
    const selected = this.findSelectedSpool()
    const saved = selected ? await this.updateSpool(selected.id, payload) : await this.createSpool(payload)
    await this.reload()
    this.selectedSpoolId = saved.id
    this.formError = ''
    this.isDetailsOpen = false
  }

  private async setSelectedSpoolInUse(): Promise<void> {
    const selected = this.findSelectedSpool()
    if (!selected) return
    try {
      await this.updateSpool(selected.id, { active: 1 })
      await this.reload()
    } catch {
      this.formError = 'Could not set the spool in use'
    }
  }

  private async deleteSelectedSpool(): Promise<void> {
    const selected = this.findSelectedSpool()
    if (!selected) return
    if (!this.confirmAction(`Delete ${buildSpoolName(selected)}?`)) return
    try {
      await this.removeSpool(selected)
    } catch {
      this.formError = 'Could not delete the spool'
    }
  }

  private async removeSpool(spool: Spool): Promise<void> {
    const response = await this.deleteSpool(spool.id)
    if (response.status === HAS_LINKED_PRINTS_STATUS) {
      this.formError = 'This spool has linked prints, so it cannot be deleted'
      return
    }
    if (!response.ok) throw new Error(`Delete failed: ${response.status}`)
    await this.reload()
    this.selectFirstSpool()
    this.isDetailsOpen = false
  }

  private findVisibleSpools(): Spool[] {
    return filterSpools(this.spools, this.materialFilter, this.showFilter)
  }

  private renderSectionHeader(title: string): TemplateResult {
    return html`<div class="section-header">
      ${renderIcon('chevron-down', SECTION_CHEVRON_SIZE, ICON_STROKE_WIDTH)}${title}
    </div>`
  }

  private renderSelect(
    label: string,
    shownText: TemplateResult,
    options: TemplateResult,
    onChange: (event: Event) => void,
  ): TemplateResult {
    return html`<label class="value-field select-field filter-select">
      <span class="select-text">${shownText}</span>
      ${renderIcon('chevron-down', SELECT_CHEVRON_SIZE, ICON_STROKE_WIDTH)}
      <select aria-label=${label} @change=${onChange}>
        ${options}
      </select>
    </label>`
  }

  private renderMaterialFilter(): TemplateResult {
    const shownText =
      this.materialFilter === ''
        ? html`<span class="desktop-text">All</span><span class="phone-text">All materials</span>`
        : html`${formatMaterialLabel(this.materialFilter)}`
    const options = html`<option value="" ?selected=${this.materialFilter === ''}>All materials</option>
      ${listMaterials(this.spools).map(
        (material) =>
          html`<option value=${material} ?selected=${material === this.materialFilter}>
            ${formatMaterialLabel(material)}
          </option>`,
      )}`
    return this.renderSelect('Material', shownText, options, (event) => {
      this.materialFilter = (event.target as HTMLSelectElement).value
    })
  }

  private renderShowFilter(): TemplateResult {
    const shownText = html`${this.showFilter === 'all' ? 'All spools' : 'In use'}`
    const options = html`<option value="all" ?selected=${this.showFilter === 'all'}>All spools</option>
      <option value="in-use" ?selected=${this.showFilter === 'in-use'}>In use</option>`
    return this.renderSelect('Show', shownText, options, (event) => {
      this.showFilter = (event.target as HTMLSelectElement).value as ShowFilter
    })
  }

  private renderSummaryRow(label: string, key: string, value: number, unit = ''): TemplateResult {
    return html`<div class="parameter-row">
      <span class="parameter-label">${label}</span>
      <span class="value-field" data-summary=${key}
        >${value}${unit === '' ? nothing : html`<span class="value-unit">${unit}</span>`}</span
      >
    </div>`
  }

  private renderFiltersPanel(): TemplateResult {
    const summary = summarizeSpools(this.findVisibleSpools())
    return html`<aside class="spools-filters" aria-label="Parameters">
      <div class="spools-filters-body">
        <div class="section filters-section">
          ${this.renderSectionHeader('Filters')}
          <div class="section-body filter-controls">
            <div class="parameter-row"><span class="parameter-label">Material</span>${this.renderMaterialFilter()}</div>
            <div class="parameter-row"><span class="parameter-label">Show</span>${this.renderShowFilter()}</div>
          </div>
        </div>
        <div class="section summary-section">
          ${this.renderSectionHeader('Summary')}
          <div class="section-body">
            ${this.renderSummaryRow('Spools', 'spools', summary.spoolCount)}
            ${this.renderSummaryRow('In use', 'in-use', summary.inUseCount)}
            ${this.renderSummaryRow('Filament left', 'filament-left', summary.filamentLeftGrams, 'g')}
          </div>
        </div>
      </div>
      <div class="spools-filters-footer">
        <button class="button primary add-spool-button" @click=${this.startNewSpool}>
          ${renderIcon('plus', SECTION_CHEVRON_SIZE)}Add spool
        </button>
      </div>
    </aside>`
  }

  private renderSpoolRow(spool: Spool): TemplateResult {
    const isSelected = spool.id === this.selectedSpoolId
    const name = buildSpoolName(spool)
    return html`<div
      class="table-row spool-row ${isSelected ? 'selected' : ''}"
      tabindex="0"
      @click=${() => this.selectSpool(spool)}
      @keydown=${(event: KeyboardEvent) => event.key === 'Enter' && this.selectSpool(spool)}
    >
      <span class="spool-swatch" style="background: ${spool.color_hex ?? 'transparent'}"></span>
      <div class="spool-heading">
        <span class="spool-name">${name}</span>
        <span class="spool-meta">
          <span class="spool-material monospace">${formatMaterialLabel(spool.material)}</span>
          <span class="spool-color">${spool.color}</span>
          <span class="spool-price monospace">€${formatCostPerGram(spool.cost_per_gram)}</span>
        </span>
      </div>
      <span class="spool-remaining">
        <span class="remaining-bar"
          ><span class="remaining-fill" style="width: ${calculateRemainingPercent(spool)}%"></span
        ></span>
        <span class="remaining-grams monospace">${spool.current_weight_g} / ${spool.initial_weight_g} g</span>
      </span>
      <span class="spool-tag-cell">${spool.active ? html`<span class="in-use-tag">IN USE</span>` : nothing}</span>
      <button
        class="button icon-only flat edit-spool-button"
        aria-label="Edit ${name}"
        @click=${(event: Event) => {
          event.stopPropagation()
          this.editSpool(spool)
        }}
      >
        ${renderIcon('edit')}
      </button>
    </div>`
  }

  private renderStateMessage(): TemplateResult | null {
    if (this.loadState === 'loading') return html`<div class="state-message">Loading spools…</div>`
    if (this.loadState === 'error') return html`<div class="state-message">Could not load spools</div>`
    if (this.spools.length === 0) return html`<div class="state-message">No spools yet</div>`
    if (this.findVisibleSpools().length === 0) {
      return html`<div class="state-message">No spools match the filters</div>`
    }
    return null
  }

  private renderTable(): TemplateResult {
    return html`<div class="spools-table">
      <div class="table-row header spool-header">
        <span></span><span>Spool</span><span>Material</span><span>Color</span><span>Remaining</span
        ><span class="spool-price">€ / g</span><span></span>
      </div>
      ${this.renderStateMessage() ??
      html`<div class="spool-rows">${this.findVisibleSpools().map((spool) => this.renderSpoolRow(spool))}</div>`}
    </div>`
  }

  private renderMain(): TemplateResult {
    return html`<section class="spools-main" aria-label="Main">
      <div class="spools-title-strip">
        <span class="spools-title">Spools</span>
        <span class="spools-count monospace muted">${this.findVisibleSpools().length}</span>
      </div>
      ${this.renderTable()}
    </section>`
  }

  private renderTextField(label: string, name: keyof SpoolForm, width = 'wide-field', unit = ''): TemplateResult {
    return html`<label class="parameter-row">
      <span class="parameter-label">${label}</span>
      <span class="value-field ${width}"
        ><input
          type="text"
          name=${name}
          .value=${this.form[name]}
          @input=${(event: Event) => this.changeField(name, event)}
        />${unit === '' ? nothing : html`<span class="value-unit">${unit}</span>`}</span
      >
    </label>`
  }

  private renderColorHexField(): TemplateResult {
    const color = normalizeHexadecimalColor(this.form.colorHex)
    return html`<label class="parameter-row">
      <span class="parameter-label">Color hex</span>
      <span class="hex-group">
        <span class="hex-swatch" style="background: ${color ?? 'transparent'}"></span>
        <span class="value-field hex-field"
          ><input
            type="text"
            name="colorHex"
            .value=${this.form.colorHex}
            @input=${(event: Event) => this.changeField('colorHex', event)}
        /></span>
      </span>
    </label>`
  }

  private renderDetailsSections(): TemplateResult {
    return html`
      <div class="section">
        ${this.renderSectionHeader('Identity')}
        <div class="section-body">
          ${this.renderTextField('Brand', 'brand')} ${this.renderTextField('Material', 'material')}
          ${this.renderTextField('Color', 'color')} ${this.renderColorHexField()}
        </div>
      </div>
      <div class="section">
        ${this.renderSectionHeader('Weight & cost')}
        <div class="section-body">
          ${this.renderTextField('Initial', 'initialWeight', '', 'g')}
          ${this.renderTextField('Current', 'currentWeight', '', 'g')}
          ${this.renderTextField('Cost per gram', 'costPerGram', '', '€')}
        </div>
      </div>
      <div class="section">
        ${this.renderSectionHeader('Notes')}
        <div class="section-body notes-body">
          <textarea
            class="notes-field"
            name="notes"
            placeholder="[Notes]"
            aria-label="Notes"
            .value=${this.form.notes}
            @input=${(event: Event) => this.changeField('notes', event)}
          ></textarea>
        </div>
      </div>
    `
  }

  private renderDetailsFooter(selected: Spool | null): TemplateResult {
    return html`<div class="details-footer">
      <button class="button primary save-button" @click=${this.saveSpool}>Save</button>
      ${selected && !selected.active
        ? html`<button class="button set-in-use-button" @click=${this.setSelectedSpoolInUse}>Set in use</button>`
        : nothing}
      ${selected
        ? html`<button
            class="button icon-only danger delete-spool-button"
            aria-label="Delete spool"
            @click=${this.deleteSelectedSpool}
          >
            ${renderIcon('trash')}
          </button>`
        : nothing}
    </div>`
  }

  private renderDetails(): TemplateResult {
    const selected = this.findSelectedSpool()
    return html`<aside class="spools-details ${this.isDetailsOpen ? 'open' : ''}" aria-label="Details">
      <div class="section-header details-title">
        ${selected ? 'Edit spool' : 'Add spool'}
        <button class="button icon-only flat close-details-button" aria-label="Close" @click=${this.closeDetails}>
          ${renderIcon('close')}
        </button>
      </div>
      <div class="details-body">
        ${this.formError === '' ? nothing : html`<div class="form-error" role="alert">${this.formError}</div>`}
        ${this.renderDetailsSections()}
      </div>
      ${this.renderDetailsFooter(selected)}
    </aside>`
  }

  render(): TemplateResult {
    return html`<div class="spools-layout">
      ${this.renderFiltersPanel()} ${this.renderMain()} ${this.renderDetails()}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'spools-page': SpoolsPage
  }
}
