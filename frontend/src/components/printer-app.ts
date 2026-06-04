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

  private _updateTitle(ps: PrinterState | null) {
    if (!ps || (ps.state !== 'printing' && ps.state !== 'paused')) {
      document.title = 'printer.madebysteven.nl'
      return
    }
    const pct = ps.progress > 0 ? `${ps.progress}%` : ''
    const finish = (() => {
      if (!ps.time_remaining || ps.progress <= 0) return ''
      const total = ps.time_remaining / (ps.progress / 100)
      const remaining = total - ps.time_remaining
      return new Date(Date.now() + remaining * 1000)
        .toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    })()
    const label = ps.state === 'paused' ? '⏸' : '🖨'
    document.title = [label, pct, finish ? `→ ${finish}` : ''].filter(Boolean).join(' ')
  }

  connectedCallback() {
    super.connectedCallback()

    this._unsubscribe = sseClient.subscribe((payload: SSEPayload) => {
      if (payload.type === 'printer_state') {
        const ps = payload.data as PrinterState
        this.printing = ps.state === 'printing'
        this._updateTitle(ps)
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
