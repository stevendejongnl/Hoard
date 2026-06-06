import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { marked } from 'marked'
import { updateProject } from '../api'

const _style = document.createElement('style')
_style.textContent = `
  .md-prose { font-size: 12px; color: #ccc; line-height: 1.7; }
  .md-prose h1, .md-prose h2, .md-prose h3, .md-prose h4 {
    color: #e0e0e0; font-weight: 600; margin: 0 0 6px;
  }
  .md-prose h1 { font-size: 15px; }
  .md-prose h2 { font-size: 14px; }
  .md-prose h3, .md-prose h4 { font-size: 13px; }
  .md-prose p { margin: 0 0 8px; }
  .md-prose p:last-child { margin-bottom: 0; }
  .md-prose ul, .md-prose ol { margin: 0 0 8px; padding-left: 18px; }
  .md-prose li { margin: 2px 0; }
  .md-prose strong { color: #e0e0e0; font-weight: 600; }
  .md-prose em { font-style: italic; color: #aaa; }
  .md-prose code {
    background: #202020; border-radius: 3px;
    padding: 1px 5px; font-size: 11px; font-family: monospace; color: #22d3ee;
  }
  .md-prose pre {
    background: #202020; border-radius: 4px; padding: 10px;
    margin: 0 0 8px; overflow-x: auto;
  }
  .md-prose pre code { padding: 0; background: none; color: #ccc; }
  .md-prose blockquote {
    border-left: 2px solid #333; padding-left: 10px;
    color: #888; margin: 0 0 8px;
  }
  .md-prose a { color: #22d3ee; }
  .md-prose hr { border: none; border-top: 1px solid #222; margin: 10px 0; }
`
document.head.appendChild(_style)

@customElement('markdown-editor')
export class MarkdownEditor extends LitElement {
  @property({ type: String }) value: string = ''
  @property({ type: Number }) projectId!: number

  @state() private _editing = false
  @state() private _draft = ''
  @state() private _saved = ''
  @state() private _error = false

  createRenderRoot() {
    return this
  }

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
      this.dispatchEvent(
        new CustomEvent('notes-changed', {
          detail: { value: this._draft },
          bubbles: true,
        }),
      )
    } catch {
      this._saved = prev
      this._draft = prev
      this._error = true
      setTimeout(() => {
        this._error = false
        this.requestUpdate()
      }, 2000)
    }
  }

  render() {
    if (this._editing) {
      return html`
        <div style="background: #1a1a1a; border: 1px solid #22d3ee44; border-radius: 8px; padding: 16px;">
          <div
            style="font-size: 10px; color: #555; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;"
          >
            Notes
          </div>
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
        <div
          style="font-size: 10px; color: #555; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;"
        >
          Notes
        </div>
        ${this._saved
          ? html`<div class="md-prose" .innerHTML=${marked.parse(this._saved) as string}></div>`
          : html`<div style="font-size: 12px; color: #333; font-style: italic;">Click to add notes…</div>`}
        <div style="margin-top: 8px; font-size: 9px; color: #333;">click to edit</div>
      </div>
    `
  }
}
