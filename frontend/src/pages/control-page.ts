import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { getControlLayout, getControlStatus, resetControlLayout, saveControlLayout } from '../api'
import { renderControlCameraFocus, renderControlCard } from '../control-cards'
import type { CameraFocusRenderer, CardContext, CardRenderer } from '../control-cards'
import {
  CARDS,
  DEFAULT_LAYOUT,
  GROUPS,
  findCard,
  hideCard,
  listHiddenCards,
  listVisibleCards,
  moveCard,
  normalizeLayout,
  readSpan,
  setSpan,
  shiftCard,
  showCard,
} from '../control-layout'
import type { CardFilter, CardKey, ControlLayout, Span } from '../control-layout'
import { renderIcon } from '../icons'
import type { ControlDevice, ControlStatus } from '../types'
import '../styles/control.css'

type StopFunction = () => void
type SaveMessage = '' | 'saved' | 'failed'

const SAVE_PAUSE_MILLISECONDS = 600
const STATUS_REFRESH_MILLISECONDS = 2000
const PHONE_MEDIA_QUERY = '(max-width: 800px)'
const SPANS: Span[] = [1, 2, 3]
const FULL_WIDTH: Span = 3

function waitForPause(callback: () => void): () => void {
  const timer = setTimeout(callback, SAVE_PAUSE_MILLISECONDS)
  return () => clearTimeout(timer)
}

function repeatWithInterval(callback: () => void): StopFunction {
  const interval = setInterval(callback, STATUS_REFRESH_MILLISECONDS)
  return () => clearInterval(interval)
}

function readDeviceFromScreen(): ControlDevice {
  return window.matchMedia(PHONE_MEDIA_QUERY).matches ? 'phone' : 'desktop'
}

function describeSpan(span: Span): string {
  return span === 1 ? '1 column' : `${span} columns`
}

function describePrinterState(status: ControlStatus | null): string {
  if (!status) return 'Printer not reachable'
  if (status.state === 'printing') return 'Printing'
  if (status.state === 'paused') return 'Print paused'
  return 'Printer idle'
}

/** Controls the printer: cards that move it, heat it and tune it, laid out the way the person likes. */
@customElement('control-page')
export class ControlPage extends LitElement {
  @property({ attribute: false }) loadStatus: () => Promise<ControlStatus> = getControlStatus
  @property({ attribute: false }) loadLayout: (device: ControlDevice) => Promise<unknown> = getControlLayout
  @property({ attribute: false }) saveLayout: (device: ControlDevice, layout: ControlLayout) => Promise<unknown> =
    saveControlLayout
  @property({ attribute: false }) resetLayout: (device: ControlDevice) => Promise<unknown> = resetControlLayout
  @property({ attribute: false }) readDevice: () => ControlDevice = readDeviceFromScreen
  @property({ attribute: false }) repeatEvery: (callback: () => void) => StopFunction = repeatWithInterval
  @property({ attribute: false }) scheduleSave: (callback: () => void) => () => void = waitForPause
  @property({ attribute: false }) renderCard: CardRenderer = renderControlCard
  @property({ attribute: false }) renderCameraFocus: CameraFocusRenderer = renderControlCameraFocus

  @state() private layout: ControlLayout = structuredClone(DEFAULT_LAYOUT)
  @state() private filter: CardFilter = 'all'
  @state() private isEditing = false
  @state() private isCameraFocusOpen = false
  @state() private status: ControlStatus | null = null
  @state() private message: SaveMessage = ''

  private device: ControlDevice = 'desktop'
  private draggedCard: CardKey | null = null
  private cancelPendingSave: (() => void) | null = null
  private stopRepeating: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.device = this.readDevice()
    void this.loadStoredLayout()
    void this.refreshStatus()
    this.stopRepeating = this.repeatEvery(() => void this.refreshStatus())
    this.addEventListener('control-changed', this.handleCommandSent)
    this.addEventListener('control-camera-focus', this.openCameraFocus)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopRepeating?.()
    this.removeEventListener('control-changed', this.handleCommandSent)
    this.removeEventListener('control-camera-focus', this.openCameraFocus)
    if (!this.cancelPendingSave) return
    this.cancelPendingSave()
    void this.save()
  }

  private readonly handleCommandSent = (): void => void this.refreshStatus()

  private readonly openCameraFocus = (): void => {
    this.isCameraFocusOpen = true
  }

  private async loadStoredLayout(): Promise<void> {
    try {
      this.layout = normalizeLayout(await this.loadLayout(this.device))
    } catch {
      this.layout = structuredClone(DEFAULT_LAYOUT)
    }
  }

  private async refreshStatus(): Promise<void> {
    try {
      this.status = await this.loadStatus()
    } catch {
      this.status = null
    }
  }

  private get isLocked(): boolean {
    return this.status?.locked === true
  }

  private changeLayout(layout: ControlLayout): void {
    this.layout = layout
    this.message = ''
    this.cancelPendingSave?.()
    this.cancelPendingSave = this.scheduleSave(() => void this.save())
  }

  private async save(): Promise<void> {
    this.cancelPendingSave = null
    try {
      await this.saveLayout(this.device, this.layout)
      this.message = 'saved'
    } catch {
      this.message = 'failed'
    }
  }

  private async reset(): Promise<void> {
    this.cancelPendingSave?.()
    this.cancelPendingSave = null
    this.layout = structuredClone(DEFAULT_LAYOUT)
    try {
      await this.resetLayout(this.device)
      this.message = 'saved'
    } catch {
      this.message = 'failed'
    }
  }

  private startDragging(key: CardKey): void {
    if (this.isEditing) this.draggedCard = key
  }

  private allowDropping(event: Event): void {
    if (this.draggedCard) event.preventDefault()
  }

  private drop(target: CardKey, event: Event): void {
    event.preventDefault()
    if (this.draggedCard) this.changeLayout(moveCard(this.layout, this.draggedCard, target))
    this.draggedCard = null
  }

  private renderSpanChoice(key: CardKey): TemplateResult {
    const title = findCard(key).title
    return html`<span class="control-span-choice" role="group" aria-label="${title} width">
      ${SPANS.map(
        (span) =>
          html`<button
            class="control-span-button"
            aria-label="${title} spans ${describeSpan(span)}"
            aria-pressed=${readSpan(this.layout, key) === span ? 'true' : 'false'}
            @click=${() => this.changeLayout(setSpan(this.layout, key, span))}
          >
            ${span}
          </button>`,
      )}
    </span>`
  }

  private renderEditButton(
    label: string,
    icon: 'arrow-up' | 'arrow-down' | 'eye-off',
    onPress: () => void,
    isDisabled = false,
  ) {
    return html`<button
      class="button flat icon-only control-edit-button"
      aria-label=${label}
      ?disabled=${isDisabled}
      @click=${onPress}
    >
      ${renderIcon(icon, 16)}
    </button>`
  }

  private renderEditBar(key: CardKey, shown: CardKey[]): TemplateResult {
    const { title, icon } = findCard(key)
    const position = shown.indexOf(key)
    return html`<div class="control-edit-bar">
      <span class="control-grip" aria-hidden="true">${renderIcon('grip', 16)}</span>
      <span class="control-edit-title">${renderIcon(icon, 14)}${title}</span>
      ${this.renderSpanChoice(key)}
      ${this.renderEditButton(
        `Move ${title} up`,
        'arrow-up',
        () => this.changeLayout(shiftCard(this.layout, key, -1, this.filter)),
        position <= 0,
      )}
      ${this.renderEditButton(
        `Move ${title} down`,
        'arrow-down',
        () => this.changeLayout(shiftCard(this.layout, key, 1, this.filter)),
        position >= shown.length - 1,
      )}
      ${this.renderEditButton(`Hide ${title}`, 'eye-off', () => this.changeLayout(hideCard(this.layout, key)))}
    </div>`
  }

  private createCardContext(): CardContext {
    return { status: this.status, locked: this.isLocked, refresh: () => void this.refreshStatus() }
  }

  private renderCameraFocusOverlay(): TemplateResult | typeof nothing {
    if (!this.isCameraFocusOpen) return nothing
    return this.renderCameraFocus(this.createCardContext(), () => (this.isCameraFocusOpen = false))
  }

  private renderSlot(key: CardKey, shown: CardKey[]): TemplateResult {
    const isAlone = this.filter === key
    const span = isAlone ? FULL_WIDTH : readSpan(this.layout, key)
    return html`<div
      class="control-slot ${this.isEditing ? 'editing' : ''}"
      data-card=${key}
      style="grid-column: span ${span}"
      draggable=${this.isEditing ? 'true' : 'false'}
      @dragstart=${() => this.startDragging(key)}
      @dragover=${(event: Event) => this.allowDropping(event)}
      @drop=${(event: Event) => this.drop(key, event)}
      @dragend=${() => (this.draggedCard = null)}
    >
      ${this.isEditing ? this.renderEditBar(key, shown) : nothing} ${this.renderCard(key, this.createCardContext())}
    </div>`
  }

  private renderListItem(filter: CardFilter, title: string, icon: Parameters<typeof renderIcon>[0]): TemplateResult {
    return html`<button
      class="control-list-item ${this.filter === filter ? 'selected' : ''}"
      aria-current=${this.filter === filter ? 'true' : 'false'}
      @click=${() => (this.filter = filter)}
    >
      <span class="control-list-icon">${renderIcon(icon, 16)}</span>
      <span class="control-list-title">${title}</span>
    </button>`
  }

  private renderListGroup(group: (typeof GROUPS)[number]): TemplateResult {
    const cards = CARDS.filter((card) => card.group === group.filter)
    return html`<button
        class="control-list-heading ${this.filter === group.filter ? 'selected' : ''}"
        @click=${() => (this.filter = group.filter)}
      >
        ${group.title}
      </button>
      ${cards.map((card) => this.renderListItem(card.key, card.title, card.icon))}`
  }

  private renderList(): TemplateResult {
    const groups = GROUPS.filter((group) => group.filter !== 'all')
    return html`<nav class="control-list" aria-label="Control">
      ${this.renderListItem('all', 'Everything', 'dashboard')} ${groups.map((group) => this.renderListGroup(group))}
    </nav>`
  }

  private renderFilter(): TemplateResult {
    return html`<div class="control-filter" role="group" aria-label="Show">
      ${GROUPS.map(
        (group) =>
          html`<button
            class="control-filter-button ${this.filter === group.filter ? 'selected' : ''}"
            aria-pressed=${this.filter === group.filter ? 'true' : 'false'}
            @click=${() => (this.filter = group.filter)}
          >
            ${group.filter === 'all' ? 'All' : group.title}
          </button>`,
      )}
    </div>`
  }

  private renderHiddenTray(): TemplateResult | typeof nothing {
    const hidden = listHiddenCards(this.layout)
    if (!this.isEditing || hidden.length === 0) return nothing
    return html`<div class="control-hidden-tray">
      <span class="control-hidden-label">Hidden</span>
      ${hidden.map((key) => {
        const { title, icon } = findCard(key)
        return html`<button
          class="button control-hidden-card"
          aria-label="Show ${title}"
          @click=${() => this.changeLayout(showCard(this.layout, key))}
        >
          ${renderIcon(icon, 14)}${title}${renderIcon('eye', 14)}
        </button>`
      })}
    </div>`
  }

  private renderMessage(): TemplateResult | typeof nothing {
    if (this.message === 'saved') return html`<span class="control-save-status">Saved</span>`
    if (this.message === 'failed') {
      return html`<span class="control-save-status control-save-failed">Could not save the layout</span>`
    }
    return nothing
  }

  private renderStrip(): TemplateResult {
    return html`<div class="control-strip">
      <span class="control-title">Control</span>
      <span class="control-strip-actions">
        ${this.renderMessage()}<span class="muted control-printer-state">${describePrinterState(this.status)}</span>
        ${this.isEditing
          ? html`<button class="button" @click=${() => void this.reset()}>Reset layout</button>`
          : nothing}
        <button class="button" @click=${() => (this.isEditing = !this.isEditing)}>
          ${this.isEditing ? 'Done' : html`${renderIcon('edit', 14)}Edit layout`}
        </button>
      </span>
    </div>`
  }

  private renderLockedNote(): TemplateResult | typeof nothing {
    if (!this.status?.locked) return nothing
    return html`<div class="control-locked-note">
      The printer is busy: moving, the extruder, macros, the console and calibration are locked. Temperatures, speed,
      flow, fans and the Z offset stay available.
    </div>`
  }

  render(): TemplateResult {
    const shown = listVisibleCards(this.layout, this.filter)
    return html`<div class="control-layout">
      ${this.renderStrip()}
      <div class="control-body">
        ${this.renderList()}
        <div class="control-pane">
          ${this.renderFilter()} ${this.renderLockedNote()}
          <div class="control-grid">${shown.map((key) => this.renderSlot(key, shown))}</div>
          ${this.renderHiddenTray()}
        </div>
      </div>
      ${this.renderCameraFocusOverlay()}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'control-page': ControlPage
  }
}
