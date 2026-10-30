import { LitElement, html } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import '../styles/print-ready.css'

/** Asks a question in the page itself: a native dialog can be answered by the browser without being shown. */
@customElement('confirmation-dialog')
export class ConfirmationDialog extends LitElement {
  @property({ type: String }) message = ''
  @property({ attribute: false }) answer: (isConfirmed: boolean) => void = () => undefined

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.answer(false)
  }

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    window.addEventListener('keydown', this.handleKeydown)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('keydown', this.handleKeydown)
  }

  protected firstUpdated(): void {
    this.querySelector<HTMLButtonElement>('.cancel-confirmation-button')?.focus()
  }

  render(): TemplateResult {
    return html`<div class="ready-overlay" @click=${() => this.answer(false)}>
      <div
        class="ready-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm"
        @click=${(event: Event) => event.stopPropagation()}
      >
        <div class="section-header ready-title">Are you sure?</div>
        <div class="ready-body">${this.message}</div>
        <div class="ready-footer">
          <button class="button cancel-confirmation-button" @click=${() => this.answer(false)}>Cancel</button>
          <button class="button primary confirm-button" @click=${() => this.answer(true)}>Confirm</button>
        </div>
      </div>
    </div>`
  }
}

export function askForConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('confirmation-dialog')
    dialog.message = message
    dialog.answer = (isConfirmed) => {
      dialog.remove()
      resolve(isConfirmed)
    }
    document.body.appendChild(dialog)
  })
}

declare global {
  interface HTMLElementTagNameMap {
    'confirmation-dialog': ConfirmationDialog
  }
}
