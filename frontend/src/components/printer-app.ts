import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { sseClient } from '../sse'
import type { SSEPayload } from '../sse'
import { router } from '../router'
import type { PrinterState } from '../types'
import './top-nav'
import '../pages/home-page'
import '../pages/history-page'
import '../pages/spools-page'

@customElement('printer-app')
export class PrinterApp extends LitElement {
  @state() private route: string = '/'
  @state() private printing: boolean = false

  private _unsubscribe: (() => void) | null = null
  private _unlisten: (() => void) | null = null

  createRenderRoot() {
    return this
  }

  connectedCallback() {
    super.connectedCallback()

    this._unsubscribe = sseClient.subscribe((payload: SSEPayload) => {
      if (payload.type === 'printer_state') {
        this.printing = (payload.data as PrinterState).state === 'printing'
      }
    })

    this._unlisten = router.listen(r => { this.route = r })
    this.route = router.current
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._unsubscribe?.()
    this._unlisten?.()
  }

  render() {
    return html`
      <top-nav .printing=${this.printing}></top-nav>
      ${this.route === '/history'
        ? html`<history-page></history-page>`
        : this.route === '/spools'
          ? html`<spools-page></spools-page>`
          : html`<home-page></home-page>`}
    `
  }
}
