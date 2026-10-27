import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { marked } from 'marked'
import { updateProject } from '../api'
import { renderIcon } from '../icons'

const SAVE_FAILURE_MESSAGE = 'Could not save the notes. Try again.'

/** The notes panel of a project: markdown for reading, a text field for editing. */
@customElement('markdown-editor')
export class MarkdownEditor extends LitElement {
  @property({ type: String }) value = ''
  @property({ type: Number }) projectId = 0
  @property({ attribute: false }) saveNotes: (notes: string) => Promise<unknown> = (notes) =>
    updateProject(this.projectId, { notes })

  @state() private isEditing = false
  @state() private draft = ''
  @state() private hasSaveFailed = false

  createRenderRoot() {
    return this
  }

  private startEditing(): void {
    this.draft = this.value
    this.hasSaveFailed = false
    this.isEditing = true
  }

  private cancelEditing(): void {
    this.isEditing = false
    this.hasSaveFailed = false
  }

  private handleDraftInput(event: Event): void {
    this.draft = (event.target as HTMLTextAreaElement).value
  }

  private async save(): Promise<void> {
    try {
      await this.saveNotes(this.draft)
    } catch {
      this.hasSaveFailed = true
      return
    }
    this.value = this.draft
    this.isEditing = false
    this.dispatchEvent(new CustomEvent('notes-changed', { detail: { value: this.draft }, bubbles: true }))
  }

  private renderActions(): TemplateResult {
    if (!this.isEditing) {
      return html`<button class="button panel-action" @click=${this.startEditing}>
        ${renderIcon('edit', 14)}Edit
      </button>`
    }
    return html`<button class="button panel-action flat" @click=${this.cancelEditing}>Cancel</button>
      <button class="button panel-action primary" @click=${this.save}>Save</button>`
  }

  private renderReading(): TemplateResult {
    if (this.value.trim() === '') return html`<div class="notes-text">No notes yet</div>`
    return html`<div class="notes-text">${unsafeHTML(marked.parse(this.value) as string)}</div>`
  }

  private renderEditing(): TemplateResult {
    return html`<textarea
      class="notes-input"
      aria-label="Notes"
      .value=${this.draft}
      @input=${this.handleDraftInput}
    ></textarea>`
  }

  private renderError(): TemplateResult | typeof nothing {
    if (!this.hasSaveFailed) return nothing
    return html`<div class="notes-error" role="alert">${SAVE_FAILURE_MESSAGE}</div>`
  }

  render(): TemplateResult {
    return html`<section class="panel notes-panel" aria-label="Notes">
      <div class="section-header panel-header">Notes<span class="panel-actions">${this.renderActions()}</span></div>
      <div class="panel-body">
        ${this.isEditing ? this.renderEditing() : this.renderReading()} ${this.renderError()}
      </div>
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'markdown-editor': MarkdownEditor
  }
}
