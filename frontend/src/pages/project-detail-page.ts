import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('project-detail-page')
export class ProjectDetailPage extends LitElement {
  createRenderRoot() { return this }
  render() { return html`<div style="padding: 40px; color: #555;">Loading...</div>` }
}
