import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { emergencyStop } from '../api'
import { renderIcon } from '../icons'
import { hoardMark } from '../logo'
import { NAVIGATION_ITEMS, findNavigationSection, followNavigationLink } from '../navigation'
import type { NavigationItem } from '../navigation'
import { router } from '../router'

type NavigateFunction = (path: string) => void

const EMERGENCY_STOP_CONFIRMATION = 'Emergency stop? This will halt all motion immediately.'
const EMERGENCY_STOP_FAILURE = 'Emergency stop failed. Check the printer connection.'

const navigateWithRouter: NavigateFunction = (path) => router.navigate(path as Parameters<typeof router.navigate>[0])

/** The top bar: brand, the four sections as tabs, and the actions that are always within reach. */
@customElement('top-navigation')
export class TopNavigation extends LitElement {
  @property({ type: String }) route = '/'
  @property({ attribute: false }) navigate: NavigateFunction = navigateWithRouter
  @property({ attribute: false }) confirmEmergencyStop: (message: string) => boolean = (message) =>
    window.confirm(message)
  @property({ attribute: false }) stopEmergency: () => Promise<unknown> = () => emergencyStop()
  @property({ attribute: false }) reportFailure: (message: string) => void = (message) => window.alert(message)

  createRenderRoot() {
    return this
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

  private renderBrand(): TemplateResult {
    return html`<a class="brand" href="/" @click=${(click: MouseEvent) => this.followLink(click, '/')}>
      <span class="brand-mark">${hoardMark(20)}</span>Hoard
    </a>`
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

  private renderEmergencyStop(): TemplateResult {
    return html`<button
      class="button emergency-stop"
      aria-label="Emergency stop"
      @click=${() => this.handleEmergencyStop()}
    >
      ${renderIcon('emergency-stop', 18)}<span class="label">Emergency stop</span>
    </button>`
  }

  render(): TemplateResult {
    return html`<header class="top-navigation">
      ${this.renderBrand()} ${this.renderTabs()}
      <div class="top-navigation-actions">${this.renderEmergencyStop()}</div>
    </header>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'top-navigation': TopNavigation
  }
}
