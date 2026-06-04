import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { Project } from '../types'
import { getProjects, createProject } from '../api'
import '../components/project-card'

@customElement('projects-page')
export class ProjectsPage extends LitElement {
  createRenderRoot() { return this }

  @state() projects: Project[] = []
  @state() loading = true

  connectedCallback() {
    super.connectedCallback()
    this._reload()
  }

  private async _reload() {
    this.loading = true
    this.projects = await getProjects()
    this.loading = false
  }

  private async _create() {
    const name = prompt('Project name:')
    if (!name?.trim()) return
    const p = await createProject(name.trim())
    window.router.navigate(`/projects/${p.id}` as any)
  }

  render() {
    return html`
      <div style="max-width: 900px; margin: 0 auto; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;">
          <span style="font-size: 16px; font-weight: 600; color: #e0e0e0;">Projects</span>
          <button
            style="background: transparent; border: 1px solid #22d3ee44; color: #22d3ee; border-radius: 6px; padding: 7px 14px; font-size: 12px; cursor: pointer; min-height: 44px;"
            @click=${this._create}
          >+ new project</button>
        </div>

        ${this.loading
          ? html`<div style="color: #555; padding: 40px; text-align: center;">Loading...</div>`
          : this.projects.length === 0
            ? html`<div style="color: #555; padding: 40px; text-align: center;">No projects yet. Create one to get started.</div>`
            : html`
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                ${this.projects.map(p => html`<project-card .project=${p}></project-card>`)}
              </div>
            `}
      </div>
    `
  }
}
