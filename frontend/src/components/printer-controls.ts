import { LitElement, css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { Power, PrinterState } from '../types'
import { sseClient } from '../sse'
import {
  cancelPrint,
  emergencyStop,
  firmwareRestart,
  pausePrint,
  powerOff,
  powerOn,
  resumePrint,
} from '../api'

@customElement('printer-controls')
export class PrinterControls extends LitElement {
  @state() private power: Power | null = null
  @state() private printerState: PrinterState | null = null
  @state() private busy = false

  private _unsub: (() => void) | null = null

  static styles = css`
    :host { display: block; }

    .strip {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius, 8px);
      padding: 12px 18px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .group-label {
      font-size: 9px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding-right: 4px;
      border-right: 1px solid var(--border);
      margin-right: 2px;
    }

    .sep {
      width: 1px;
      height: 20px;
      background: var(--border);
    }

    /* Toggle */
    .power-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }

    .toggle-track {
      width: 36px;
      height: 20px;
      border-radius: 10px;
      background: var(--bg-raised);
      border: 1px solid var(--border);
      position: relative;
      transition: background 0.2s, border-color 0.2s;
    }

    .toggle-track.on {
      background: var(--cyan-dim);
      border-color: var(--cyan-border);
    }

    .toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--text-muted);
      transition: transform 0.2s, background 0.2s;
    }

    .toggle-track.on .toggle-thumb {
      transform: translateX(16px);
      background: var(--cyan);
    }

    .toggle-label {
      font-size: 11px;
      color: var(--text-muted);
    }

    .toggle-track.on + .toggle-label {
      color: var(--cyan);
    }

    /* Buttons */
    .btn {
      font-size: 10px;
      padding: 5px 12px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      transition: color 0.15s, border-color 0.15s;
      white-space: nowrap;
    }

    .btn:hover:not(:disabled) {
      color: var(--text);
      border-color: #444;
    }

    .btn:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .btn.danger {
      color: #ef4444;
      border-color: #ef444430;
    }

    .btn.danger:hover:not(:disabled) {
      background: #ef444410;
      border-color: #ef4444;
    }

    .btn.warn {
      color: #f59e0b;
      border-color: #f59e0b30;
    }

    .btn.warn:hover:not(:disabled) {
      background: #f59e0b10;
      border-color: #f59e0b;
    }

    .state-pill {
      font-size: 9px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--bg-raised);
      border: 1px solid var(--border);
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .state-pill.error { color: #ef4444; border-color: #ef444430; background: #ef444408; }
    .state-pill.printing { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-dim); }
    .state-pill.paused { color: #f59e0b; border-color: #f59e0b30; background: #f59e0b08; }
  `

  connectedCallback() {
    super.connectedCallback()
    this._unsub = sseClient.subscribe(payload => {
      if (payload.type === 'power') this.power = payload.data
      if (payload.type === 'printer_state') this.printerState = payload.data
    })
    // get initial power state without waiting for SSE poll
    fetch('/api/control/power')
      .then(r => r.json())
      .then((d: { state: string }) => {
        if (this.power) {
          this.power = { ...this.power, switch: d.state as Power['switch'] }
        } else {
          this.power = { watts: 0, eur_per_kwh: 0, switch: d.state as Power['switch'] }
        }
      })
      .catch(() => {})
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._unsub?.()
  }

  private async _act(fn: () => Promise<unknown>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return
    this.busy = true
    try { await fn() } catch (e) { console.error(e) } finally { this.busy = false }
  }

  private async _powerToggle() {
    const isOn = this.power?.switch === 'on'
    if (isOn && !window.confirm('Turn printer off?')) return
    // optimistic flip
    this.power = { ...(this.power ?? { watts: 0, eur_per_kwh: 0, switch: 'off' }), switch: isOn ? 'off' : 'on' }
    try {
      await (isOn ? powerOff() : powerOn())
    } catch (e) {
      // revert on failure
      this.power = { ...this.power, switch: isOn ? 'on' : 'off' }
      console.error(e)
    }
  }

  render() {
    const switchOn = this.power?.switch === 'on'
    const state = this.printerState?.state ?? 'standby'
    const isPrinting = state === 'printing'
    const isPaused = state === 'paused'
    const isError = state === 'error'
    const d = this.busy

    return html`
      <div class="strip">

        <!-- Power -->
        <div class="group">
          <span class="group-label">Power</span>
          <div class="power-toggle" @click=${this._powerToggle}>
            <div class="toggle-track ${switchOn ? 'on' : ''}">
              <div class="toggle-thumb"></div>
            </div>
          </div>
          <span class="toggle-label" style="color:${switchOn ? 'var(--cyan)' : 'var(--text-muted)'}">
            ${switchOn ? 'on' : 'off'}
          </span>
        </div>

        <div class="sep"></div>

        <!-- Klipper state -->
        <span class="state-pill ${isError ? 'error' : isPrinting ? 'printing' : isPaused ? 'paused' : ''}">
          ${state}
        </span>

        <!-- Firmware restart — always available (most useful when error) -->
        <button
          class="btn ${isError ? 'warn' : ''}"
          ?disabled=${d}
          @click=${() => this._act(() => firmwareRestart())}
          title="Send FIRMWARE_RESTART to Klipper"
        >firmware restart</button>

        ${isPrinting || isPaused ? html`
          <div class="sep"></div>

          <div class="group">
            <span class="group-label">Print</span>
            ${isPrinting ? html`
              <button class="btn" ?disabled=${d} @click=${() => this._act(() => pausePrint())}>pause</button>
            ` : ''}
            ${isPaused ? html`
              <button class="btn" ?disabled=${d} @click=${() => this._act(() => resumePrint())}>resume</button>
            ` : ''}
            <button
              class="btn danger"
              ?disabled=${d}
              @click=${() => this._act(() => cancelPrint(), 'Cancel the current print?')}
            >cancel</button>
          </div>
        ` : ''}

        ${isPrinting ? html`
          <div class="sep"></div>
          <button
            class="btn danger"
            ?disabled=${d}
            @click=${() => this._act(() => emergencyStop(), 'Emergency stop? This will halt all motion immediately.')}
            title="EMERGENCY_STOP — halts all motion immediately"
          >⚠ e-stop</button>
        ` : ''}

      </div>
    `
  }
}
