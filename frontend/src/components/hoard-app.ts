import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { property } from 'lit/decorators.js'
import { buildDocumentTitle } from '../document-title'
import { router } from '../router'
import type { ServerSentEventPayload } from '../server-sent-events-client'
import { sseClient } from '../sse'
import './bottom-tabs'
import './status-bar'
import './top-navigation'
import '../pages/dashboard-page'
import '../pages/history-page'
import '../pages/spools-page'
import '../pages/projects-page'
import '../pages/project-detail-page'
import '../pages/print-detail-page'

type StopFunction = () => void

function formatLocalClockTime(date: Date): string {
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

/** The page element for a route; unknown routes show the dashboard. */
function renderPageForRoute(route: string): TemplateResult {
  if (route === '/history') return html`<history-page></history-page>`
  if (route === '/spools') return html`<spools-page></spools-page>`
  if (route === '/projects') return html`<projects-page></projects-page>`
  if (route.startsWith('/projects/')) return html`<project-detail-page></project-detail-page>`
  if (route.startsWith('/prints/')) return html`<print-detail-page></print-detail-page>`
  return html`<dashboard-page></dashboard-page>`
}

/** The frame of the app: top bar, the page for the current route, status bar and the phone tab bar. */
@customElement('hoard-app')
export class HoardApp extends LitElement {
  @property({ attribute: false }) subscribeToPayloads: (
    handler: (payload: ServerSentEventPayload) => void,
  ) => StopFunction = (handler) => sseClient.subscribe(handler)
  @property({ attribute: false }) subscribeToRoute: (handler: (route: string) => void) => StopFunction = (handler) =>
    router.listen(handler)
  @property({ attribute: false }) readCurrentRoute: () => string = () => router.current
  @property({ attribute: false }) setDocumentTitle: (title: string) => void = (title) => {
    document.title = title
  }
  @property({ attribute: false }) renderPage: (route: string) => TemplateResult = renderPageForRoute

  @state() private route = '/'
  @state() private printerState = ''

  private stopListeningToStream: StopFunction | null = null
  private stopListeningToRoute: StopFunction | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.route = this.readCurrentRoute()
    this.stopListeningToRoute = this.subscribeToRoute((route) => (this.route = route))
    this.stopListeningToStream = this.subscribeToPayloads((payload) => this.handlePayload(payload))
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopListeningToStream?.()
    this.stopListeningToRoute?.()
  }

  private handlePayload(payload: ServerSentEventPayload): void {
    if (payload.type !== 'printer_state') return
    this.printerState = payload.data.state
    this.setDocumentTitle(buildDocumentTitle(payload.data, new Date(), formatLocalClockTime))
  }

  render(): TemplateResult {
    return html`
      <top-navigation route=${this.route} printerstate=${this.printerState}></top-navigation>
      <main class="app-content">${this.renderPage(this.route)}</main>
      <status-bar printerstate=${this.printerState}></status-bar>
      <bottom-tabs route=${this.route}></bottom-tabs>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hoard-app': HoardApp
  }
}
