import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { renderIcon } from '../icons'
import type { IconName } from '../icons'
import { NAVIGATION_ITEMS, findNavigationSection, followNavigationLink } from '../navigation'
import type { NavigationItem } from '../navigation'
import { router } from '../router'

type NavigateFunction = (path: string) => void

const ICON_FOR_SECTION: Record<NavigationItem['section'], IconName> = {
  dashboard: 'dashboard',
  history: 'history',
  projects: 'projects',
  spools: 'spools',
}

const navigateWithRouter: NavigateFunction = (path) => router.navigate(path as Parameters<typeof router.navigate>[0])

/** The phone's navigation: the same four sections as the top bar tabs, along the bottom edge. */
@customElement('bottom-tabs')
export class BottomTabs extends LitElement {
  @property({ type: String }) route = '/'
  @property({ attribute: false }) navigate: NavigateFunction = navigateWithRouter

  createRenderRoot() {
    return this
  }

  private renderTab(item: NavigationItem, currentSection: string): TemplateResult {
    const isCurrent = item.section === currentSection
    return html`<a
      class="bottom-tab"
      href=${item.path}
      aria-current=${isCurrent ? 'page' : 'false'}
      @click=${(click: MouseEvent) => followNavigationLink(click, item.path, this.navigate)}
      >${renderIcon(ICON_FOR_SECTION[item.section], 22)}<span>${item.label}</span></a
    >`
  }

  render(): TemplateResult {
    const currentSection = findNavigationSection(this.route)
    return html`<nav class="bottom-tabs" aria-label="Primary">
      ${NAVIGATION_ITEMS.map((item) => this.renderTab(item, currentSection))}
    </nav>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bottom-tabs': BottomTabs
  }
}
