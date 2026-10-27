import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import {
  pushSupported,
  isPushConfigured,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../notifications'

@customElement('push-toggle')
export class PushToggle extends LitElement {
  @state() private _visible = false
  @state() private _subscribed = false
  @state() private _busy = false

  static styles = css`
    :host {
      display: contents;
    }
    .bell {
      font-size: 14px;
      color: var(--muted-text-color);
      cursor: pointer;
      user-select: none;
    }
    .bell:hover {
      color: var(--text-color);
    }
    .bell.busy {
      opacity: 0.5;
      cursor: default;
    }
  `

  async connectedCallback() {
    super.connectedCallback()
    if (!pushSupported()) return
    try {
      if (!(await isPushConfigured())) return
    } catch {
      return
    }
    this._visible = true
    this._refresh()
  }

  private async _refresh() {
    const sub = await getPushSubscription()
    this._subscribed = Boolean(sub)
  }

  private async _toggle() {
    if (this._busy) return
    this._busy = true
    try {
      if (this._subscribed) {
        await unsubscribeFromPush()
      } else {
        await subscribeToPush()
      }
      await this._refresh()
    } catch {
      /* permission denied or subscribe failed - leave state as-is */
    } finally {
      this._busy = false
    }
  }

  render() {
    if (!this._visible) return html``
    return html`
      <span
        class="bell ${this._busy ? 'busy' : ''}"
        title=${this._subscribed ? 'Disable print notifications' : 'Enable print notifications'}
        @click=${() => this._toggle()}
        >${this._subscribed ? '🔔' : '🔕'}</span
      >
    `
  }
}
