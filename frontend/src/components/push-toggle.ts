import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { renderIcon } from '../icons'
import {
  getPushSubscription,
  isPushConfigured,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../notifications'

/** The bell of the top bar: turns print notifications on or off, shown only where push can work. */
@customElement('push-toggle')
export class PushToggle extends LitElement {
  @property({ attribute: false }) isSupported: () => boolean = pushSupported
  @property({ attribute: false }) isConfigured: () => Promise<boolean> = isPushConfigured
  @property({ attribute: false }) loadSubscription: () => Promise<unknown> = getPushSubscription
  @property({ attribute: false }) subscribe: () => Promise<void> = subscribeToPush
  @property({ attribute: false }) unsubscribe: () => Promise<void> = unsubscribeFromPush

  @state() private isVisible = false
  @state() private isSubscribed = false
  @state() private isBusy = false

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.showWhenPushCanWork()
  }

  private async showWhenPushCanWork(): Promise<void> {
    if (!this.isSupported()) return
    try {
      if (!(await this.isConfigured())) return
    } catch {
      return
    }
    this.isVisible = true
    await this.refreshSubscription()
  }

  private async refreshSubscription(): Promise<void> {
    this.isSubscribed = Boolean(await this.loadSubscription())
  }

  private async toggleSubscription(): Promise<void> {
    if (this.isBusy) return
    this.isBusy = true
    try {
      await (this.isSubscribed ? this.unsubscribe() : this.subscribe())
      await this.refreshSubscription()
    } catch {
      // permission denied or the subscription failed: leave the state as it was
    } finally {
      this.isBusy = false
    }
  }

  render(): TemplateResult | typeof nothing {
    if (!this.isVisible) return nothing
    const label = this.isSubscribed ? 'Disable print notifications' : 'Enable print notifications'
    return html`<button
      class="button icon-only push-button ${this.isSubscribed ? 'subscribed' : ''}"
      aria-label=${label}
      title=${label}
      aria-pressed=${this.isSubscribed ? 'true' : 'false'}
      @click=${this.toggleSubscription}
    >
      ${renderIcon(this.isSubscribed ? 'bell' : 'bell-off')}
    </button>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'push-toggle': PushToggle
  }
}
