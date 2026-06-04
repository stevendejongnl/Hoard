import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { Power, PrinterState } from '../types'
import { sseClient } from '../sse'
import { startPrint, powerOn, firmwareRestart } from '../api'

type Step = 'needs-power' | 'needs-firmware' | 'waiting' | 'done' | 'error'

@customElement('print-ready-modal')
export class PrintReadyModal extends LitElement {
  @state() private _open = false
  @state() private _filename = ''
  @state() private _step: Step = 'needs-power'
  @state() private _busy = false
  @state() private _power: Power | null = null
  @state() private _printerState: PrinterState | null = null

  private _unsub: (() => void) | null = null
  private _retryTimer: ReturnType<typeof setInterval> | null = null

  connectedCallback() {
    super.connectedCallback()
    this._unsub = sseClient.subscribe((payload) => {
      if (payload.type === 'power') this._power = payload.data
      if (payload.type === 'printer_state') {
        this._printerState = payload.data
        // SSE shortcut: if Klipper reports standby while we're waiting, try immediately
        if (this._step === 'waiting' && payload.data.state === 'standby') {
          this._doStartPrint()
        }
      }
    })
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._unsub?.()
    this._stopRetry()
  }

  private _startRetry() {
    this._stopRetry()
    // Poll every 5 s — more reliable than waiting for a specific SSE event
    this._retryTimer = setInterval(() => this._doStartPrint(), 5000)
  }

  private _stopRetry() {
    if (this._retryTimer) { clearInterval(this._retryTimer); this._retryTimer = null }
  }

  async tryPrint(filename: string) {
    try {
      await startPrint(filename)
      this._emit()
    } catch {
      this._filename = filename
      this._open = true
      const powerOff = !this._power || this._power.switch !== 'on'
      this._step = powerOff ? 'needs-power' : 'needs-firmware'
    }
  }

  private async _powerOn() {
    this._busy = true
    try {
      await powerOn()
      this._step = 'waiting'
    } catch (e) {
      this._step = 'error'
    } finally {
      this._busy = false
    }
  }

  private async _firmwareRestart() {
    this._busy = true
    try {
      await firmwareRestart()
      this._step = 'waiting'
    } catch (e) {
      this._step = 'error'
    } finally {
      this._busy = false
    }
  }

  private async _doStartPrint() {
    this._busy = true
    try {
      await startPrint(this._filename)
      this._open = false
      this._emit()
    } catch {
      this._step = 'error'
    } finally {
      this._busy = false
    }
  }

  private _emit() {
    this.dispatchEvent(new CustomEvent('print-started', { bubbles: true, composed: true }))
  }

  private _close() {
    this._open = false
    this._step = 'needs-power'
    this._busy = false
  }

  render() {
    if (!this._open) return html``
    return html`
      <div class="overlay" @click=${(e: Event) => e.target === e.currentTarget && this._close()}>
        <div class="modal">
          <div class="modal-header">
            <span class="title">Start print</span>
            <button class="close" @click=${this._close}>×</button>
          </div>
          <div class="body">
            <div class="filename">${this._filename}</div>
            ${this._renderStep()}
          </div>
        </div>
      </div>
    `
  }

  private _renderStep() {
    switch (this._step) {
      case 'needs-power':
        return html`
          <p class="msg">Printer is off. Power it on first.</p>
          <button class="btn-primary" ?disabled=${this._busy} @click=${this._powerOn}>
            ${this._busy ? 'Powering on…' : '⚡ Power on'}
          </button>
        `
      case 'needs-firmware':
        return html`
          <p class="msg">Firmware not connected. Restart it to connect.</p>
          <button class="btn-primary" ?disabled=${this._busy} @click=${this._firmwareRestart}>
            ${this._busy ? 'Restarting…' : '↻ Firmware restart'}
          </button>
        `
      case 'waiting':
        return html`
          <p class="msg waiting">Waiting for printer to be ready…</p>
          <div class="spinner">↻</div>
        `
      case 'error':
        return html`
          <p class="msg error">Something went wrong. Check the printer.</p>
          <button class="btn-ghost" @click=${this._close}>Close</button>
        `
      default:
        return html``
    }
  }

  static styles = css`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      backdrop-filter: blur(2px);
    }
    .modal {
      background: var(--bg-modal, #161616);
      border: 1px solid var(--border, #222);
      border-radius: 10px;
      width: 340px;
      overflow: hidden;
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px 12px;
      border-bottom: 1px solid var(--border, #222);
    }
    .title { font-size: 12px; font-weight: 300; color: #fff; }
    .close { background: none; border: none; color: var(--text-muted,#555); font-size: 16px; cursor: pointer; }
    .close:hover { color: var(--text, #e0e0e0); }
    .body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
    .filename {
      font-size: 11px;
      color: var(--text-muted, #555);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .msg { font-size: 12px; color: var(--text, #e0e0e0); margin: 0; }
    .msg.waiting { color: var(--cyan, #22d3ee); }
    .msg.error { color: #f87171; }
    .spinner {
      font-size: 24px;
      color: var(--cyan, #22d3ee);
      text-align: center;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-primary {
      background: var(--cyan, #22d3ee);
      border: none;
      border-radius: 4px;
      color: #000;
      font-size: 11px;
      font-weight: 500;
      padding: 8px 16px;
      cursor: pointer;
      width: 100%;
    }
    .btn-primary:hover { opacity: .9; }
    .btn-primary:disabled { opacity: .4; cursor: not-allowed; }
    .btn-ghost {
      background: none;
      border: 1px solid var(--border, #222);
      border-radius: 4px;
      color: var(--text-muted, #555);
      font-size: 11px;
      padding: 8px 16px;
      cursor: pointer;
      width: 100%;
    }
    .btn-ghost:hover { color: var(--text, #e0e0e0); }
  `
}

declare global {
  interface HTMLElementTagNameMap { 'print-ready-modal': PrintReadyModal }
}
