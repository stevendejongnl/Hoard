import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { emergencyStop } from '../api'
import { renderIcon } from '../icons'
import { hoardMark } from '../logo'
import {
  NAVIGATION_ITEMS,
  describePhoneHeader,
  findNavigationLabel,
  findNavigationSection,
  followNavigationLink,
} from '../navigation'
import type { NavigationItem, NavigationPath } from '../navigation'
import { router } from '../router'
import './search-modal'
import './push-toggle'
import type { SearchModal } from './search-modal'

type NavigateFunction = (path: string) => void

const BADGE_STATES = ['printing', 'paused', 'error']

const EMERGENCY_STOP_CONFIRMATION = 'Emergency stop? This will halt all motion immediately.'
const EMERGENCY_STOP_FAILURE = 'Emergency stop failed. Check the printer connection.'

const navigateWithRouter: NavigateFunction = (path) => router.navigate(path as Parameters<typeof router.navigate>[0])

/** The top bar: brand, the four sections as tabs, and the actions that are always within reach. */
@customElement('top-navigation')
export class TopNavigation extends LitElement {
  @property({ type: String }) route = '/'
  /** the printer state from the stream: printing, paused, error, standby, ... */
  @property({ type: String }) printerState = ''
  @property({ attribute: false }) navigate: NavigateFunction = navigateWithRouter
  @property({ attribute: false }) confirmEmergencyStop: (message: string) => boolean = (message) =>
    window.confirm(message)
  @property({ attribute: false }) stopEmergency: () => Promise<unknown> = () => emergencyStop()
  @property({ attribute: false }) reportFailure: (message: string) => void = (message) => window.alert(message)
  @property({ attribute: false }) openSearch: () => void = () => this.openSearchModal()

  createRenderRoot() {
    return this
  }

  private openSearchModal(): void {
    this.querySelector<SearchModal>('search-modal')?.open()
  }

  private async handleEmergencyStop(): Promise<void> {
    if (!this.confirmEmergencyStop(EMERGENCY_STOP_CONFIRMATION)) return
    await this.attemptEmergencyStop()
  }

  private async attemptEmergencyStop(): Promise<void> {
    try {
      await this.stopEmergency()
    } catch {
      this.reportFailure(EMERGENCY_STOP_FAILURE)
    }
  }

  private followLink(click: MouseEvent, path: string): void {
    followNavigationLink(click, path, this.navigate)
  }

  private renderBackLink(backPath: NavigationPath | null): TemplateResult | typeof nothing {
    if (!backPath) return nothing
    return html`<a
      class="phone-back"
      href=${backPath}
      aria-label="Back to ${findNavigationLabel(backPath)}"
      @click=${(click: MouseEvent) => this.followLink(click, backPath)}
      >${renderIcon('chevron-left', 20)}</a
    >`
  }

  private renderBrand(): TemplateResult {
    return html`<a class="brand" href="/" @click=${(click: MouseEvent) => this.followLink(click, '/')}>
      <span class="brand-mark">${hoardMark(20)}</span><span class="brand-name">Hoard</span>
    </a>`
  }

  private renderBrandArea(): TemplateResult {
    const phoneHeader = describePhoneHeader(this.route)
    return html`<div class="brand-area ${classMap({ 'has-back': phoneHeader.backPath !== null })}">
      ${this.renderBackLink(phoneHeader.backPath)}${this.renderBrand()}<span class="phone-title"
        >${phoneHeader.title}</span
      >
    </div>`
  }

  private renderSearchButton(): TemplateResult {
    return html`<button class="button icon-only search-button" aria-label="Search" @click=${() => this.openSearch()}>
      ${renderIcon('search')}
    </button>`
  }

  private renderTab(item: NavigationItem, currentSection: string): TemplateResult {
    const isCurrent = item.section === currentSection
    return html`<a
      class="navigation-tab"
      href=${item.path}
      aria-current=${isCurrent ? 'page' : 'false'}
      @click=${(click: MouseEvent) => this.followLink(click, item.path)}
      >${item.label}</a
    >`
  }

  private renderTabs(): TemplateResult {
    const currentSection = findNavigationSection(this.route)
    return html`<nav aria-label="Primary">${NAVIGATION_ITEMS.map((item) => this.renderTab(item, currentSection))}</nav>`
  }

  private renderStateBadge(): TemplateResult | typeof nothing {
    if (!BADGE_STATES.includes(this.printerState)) return nothing
    const variants = { paused: this.printerState === 'paused', error: this.printerState === 'error' }
    return html`<span class="state-badge ${classMap(variants)}"
      ><span class="pulsing-dot" aria-hidden="true"></span>${this.printerState}</span
    >`
  }

  private renderEmergencyStop(): TemplateResult {
    return html`<button
      class="button emergency-stop"
      aria-label="Emergency stop"
      @click=${() => this.handleEmergencyStop()}
    >
      ${renderIcon('emergency-stop')}<span class="label">Emergency stop</span>
    </button>`
  }

  render(): TemplateResult {
    return html`<header class="top-navigation">
      ${this.renderBrandArea()} ${this.renderTabs()}
      <div class="top-navigation-actions">
        ${this.renderStateBadge()}${this.renderSearchButton()}<push-toggle></push-toggle>${this.renderEmergencyStop()}
      </div>
      <search-modal></search-modal>
    </header>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'top-navigation': TopNavigation
  }
}
