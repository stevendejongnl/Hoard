import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { Project } from '../types'
import { getProjects, createProject } from '../api'
import '../components/project-card'

const styles = html`<style>
.projects-wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
.projects-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.projects-title { font-size: 16px; font-weight: 600; color: #e0e0e0; }
.projects-add-btn { background: transparent; border: 1px solid #22d3ee44; color: #22d3ee; border-radius: 6px; padding: 7px 14px; font-size: 12px; cursor: pointer; min-height: 44px; }
.projects-add-btn:hover, .projects-add-btn:active { background: #22d3ee14; }
.projects-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.projects-empty { color: #555; padding: 40px; text-align: center; }

@media (max-width: 860px) {
  .projects-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .projects-wrap { padding: 16px; }
  .projects-grid { grid-template-columns: 1fr; }
}
</style>`

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
      ${styles}
      <div class="projects-wrap">
        <div class="projects-header">
          <span class="projects-title">Projects</span>
          <button class="projects-add-btn" @click=${this._create}>+ new project</button>
        </div>

        ${this.loading
          ? html`<div class="projects-empty">Loading...</div>`
          : this.projects.length === 0
            ? html`<div class="projects-empty">No projects yet. Create one to get started.</div>`
            : html`
              <div class="projects-grid">
                ${this.projects.map(p => html`<project-card .project=${p}></project-card>`)}
              </div>
            `}
      </div>
    `
  }
}
