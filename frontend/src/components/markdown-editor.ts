import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { marked } from 'marked'
import { updateProject } from '../api'

@customElement('markdown-editor')
export class MarkdownEditor extends LitElement {
  @property({ type: String }) value: string = ''
  @property({ type: Number }) projectId!: number

  @state() private _editing = false
  @state() private _draft = ''
  @state() private _saved = ''
  @state() private _error = false

  createRenderRoot() { return this }

  connectedCallback() {
    super.connectedCallback()
    this._saved = this.value
    this._draft = this.value
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('value') && !this._editing) {
      this._saved = this.value
      this._draft = this.value
    }
  }

  private _startEdit() {
    this._draft = this._saved
    this._editing = true
    this.updateComplete.then(() => {
      const ta = this.querySelector<HTMLTextAreaElement>('textarea')
      if (!ta) return
      ta.focus()
      ta.selectionStart = ta.selectionEnd = ta.value.length
      ta.style.height = ta.scrollHeight + 'px'
    })
  }

  private async _save() {
    this._editing = false
    const prev = this._saved
    this._saved = this._draft
    this.requestUpdate()
    try {
      await updateProject(this.projectId, { notes: this._draft })
      this.dispatchEvent(new CustomEvent('notes-changed', {
        detail: { value: this._draft },
        bubbles: true,
      }))
    } catch {
      this._saved = prev
      this._draft = prev
      this._error = true
      setTimeout(() => { this._error = false; this.requestUpdate() }, 2000)
    }
  }

  render() {
    if (this._editing) {
      return html`
        <div style="background: #1a1a1a; border: 1px solid #22d3ee44; border-radius: 8px; padding: 16px;">
          <div style="font-size: 10px; color: #555; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Notes</div>
          <textarea
            style="width: 100%; background: transparent; border: none; color: #ccc; font-size: 12px; line-height: 1.7; resize: none; outline: none; font-family: var(--font); min-height: 80px; box-sizing: border-box;"
            .value=${this._draft}
            @input=${(e: Event) => {
              const ta = e.target as HTMLTextAreaElement
              this._draft = ta.value
              ta.style.height = 'auto'
              ta.style.height = ta.scrollHeight + 'px'
            }}
            @blur=${this._save}
          ></textarea>
        </div>
      `
    }

    const borderColor = this._error ? '#ef4444' : '#222'
    return html`
      <div
        style="background: #1a1a1a; border: 1px solid ${borderColor}; border-radius: 8px; padding: 16px; cursor: text; transition: border-color 0.2s;"
        @click=${this._startEdit}
      >
        <div style="font-size: 10px; color: #555; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Notes</div>
        ${this._saved
          ? html`<div style="font-size: 12px; color: #ccc; line-height: 1.7;" .innerHTML=${marked.parse(this._saved) as string}></div>`
          : html`<div style="font-size: 12px; color: #333; font-style: italic;">Click to add notes…</div>`}
        <div style="margin-top: 8px; font-size: 9px; color: #333;">click to edit</div>
      </div>
    `
  }
}
