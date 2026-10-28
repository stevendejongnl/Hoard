import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { addProjectLink, deleteProject, deleteProjectLink, getHistory, getProject } from '../api'
import '../components/link-preview-card'
import '../components/markdown-editor'
import '../components/project-files-section'
import '../components/project-prints-panel'
import { renderIcon } from '../icons'
import { followNavigationLink } from '../navigation'
import { formatCost, formatDuration, formatFilament } from '../project-list'
import { router } from '../router'
import type { PrintRecord, Project, ProjectFile, ProjectLink } from '../types'
import '../styles/projects.css'
import '../styles/project-detail.css'

type NavigateFunction = (path: string) => void

const HISTORY_RECORD_LIMIT = 200
const LINK_ADDRESS_ELLIPSIS = '/…'

const navigateWithRouter: NavigateFunction = (path) => router.navigate(path as Parameters<typeof router.navigate>[0])

function describeLinkAddress(url: string): string {
  try {
    const address = new URL(url)
    const host = address.hostname.replace(/^www\./, '')
    return address.pathname === '/' ? host : host + LINK_ADDRESS_ELLIPSIS
  } catch {
    return url
  }
}

const GRAM_SUFFIX = ' g'

function splitUnit(value: string): [string, string | null] {
  if (!value.endsWith(GRAM_SUFFIX)) return [value, null]
  return [value.slice(0, -GRAM_SUFFIX.length), 'g']
}

interface Total {
  key: string
  label: string
  value: string
  isAccented?: boolean
}

function listTotals(project: Project): Total[] {
  return [
    { key: 'prints', label: 'Prints', value: String(project.print_count) },
    { key: 'total-time', label: 'Total time', value: formatDuration(project.total_duration_s) },
    { key: 'average-time', label: 'Avg time', value: formatDuration(project.avg_duration_s) },
    { key: 'filament', label: 'Filament', value: formatFilament(project.total_filament_g) },
    { key: 'total-cost', label: 'Total cost', value: formatCost(project.total_cost), isAccented: true },
    { key: 'average-cost', label: 'Avg cost', value: formatCost(project.avg_cost) },
  ]
}

/** One project: its totals, notes, links and files in the middle, and the prints that belong to it. */
@customElement('project-detail-page')
export class ProjectDetailPage extends LitElement {
  @property({ attribute: false }) readProjectIdentifier: () => number | null = () => router.projectId
  @property({ attribute: false }) loadProject: (identifier: number) => Promise<Project> = getProject
  @property({ attribute: false }) loadHistory: () => Promise<PrintRecord[]> = async () =>
    (await getHistory(HISTORY_RECORD_LIMIT, 0)).records
  @property({ attribute: false }) deleteProject: (identifier: number) => Promise<unknown> = deleteProject
  @property({ attribute: false }) addLink: (
    identifier: number,
    data: { url: string; label?: string },
  ) => Promise<ProjectLink> = addProjectLink
  @property({ attribute: false }) removeLink: (
    identifier: number,
    linkIdentifier: number,
    clearCover: boolean,
  ) => Promise<unknown> = deleteProjectLink
  @property({ attribute: false }) confirm: (message: string) => boolean = (message) => window.confirm(message)
  @property({ attribute: false }) askText: (message: string) => string | null = (message) => window.prompt(message)
  @property({ attribute: false }) navigate: NavigateFunction = navigateWithRouter

  @state() private project: Project | null = null
  @state() private isLoading = true

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.load()
  }

  private async load(): Promise<void> {
    const identifier = this.readProjectIdentifier()
    this.project = identifier === null ? null : await this.tryLoadProject(identifier)
    this.isLoading = false
  }

  private async tryLoadProject(identifier: number): Promise<Project | null> {
    try {
      return await this.loadProject(identifier)
    } catch {
      return null
    }
  }

  private async reload(): Promise<void> {
    if (this.project) this.project = await this.loadProject(this.project.id)
  }

  private async deleteThisProject(): Promise<void> {
    if (!this.project) return
    if (!this.confirm(`Delete project "${this.project.name}"? This cannot be undone.`)) return
    await this.deleteProject(this.project.id)
    this.navigate('/projects')
  }

  private async addNewLink(): Promise<void> {
    if (!this.project) return
    const url = this.askText('Enter URL:')?.trim()
    if (!url) return
    const label = this.askText('Label (for example "printables", optional):') ?? undefined
    const link = await this.addLink(this.project.id, { url, label: label || undefined })
    this.project = { ...this.project, links: [...(this.project.links ?? []), link] }
  }

  private shouldAskAboutCover(project: Project, linkIdentifier: number): boolean {
    return project.cover_link_id === linkIdentifier && Boolean(project.cover_url)
  }

  private async removeExistingLink(linkIdentifier: number): Promise<void> {
    const project = this.project
    if (!project) return
    const shouldAsk = this.shouldAskAboutCover(project, linkIdentifier)
    const clearCover = shouldAsk && this.confirm('This link provided the cover image. Also remove the cover image?')
    await this.removeLink(project.id, linkIdentifier, clearCover)
    this.project = {
      ...project,
      links: (project.links ?? []).filter((link) => link.id !== linkIdentifier),
      cover_url: clearCover ? null : project.cover_url,
      cover_link_id: clearCover ? null : project.cover_link_id,
    }
  }

  private updateProject(changes: Partial<Project>): void {
    if (this.project) this.project = { ...this.project, ...changes }
  }

  private handleNotesChanged(event: CustomEvent<{ value: string }>): void {
    this.updateProject({ notes: event.detail.value })
  }

  private handleFilesChanged(event: CustomEvent<ProjectFile[]>): void {
    this.updateProject({ files: event.detail })
  }

  private renderTotalRow(total: Total): TemplateResult {
    const [number, unit] = splitUnit(total.value)
    return html`<div class="parameter-row">
      <span class="parameter-label">${total.label}</span>
      <span class="value-field" data-total=${total.key}
        >${number}${unit !== null ? html`<span class="value-unit">${unit}</span>` : nothing}</span
      >
    </div>`
  }

  private renderTotalCell(total: Total): TemplateResult {
    return html`<div class="total-cell">
      <span class="muted total-label">${total.label}</span>
      <span class="monospace total-value ${total.isAccented ? 'accented-value' : ''}">${total.value}</span>
    </div>`
  }

  private renderHeading(project: Project): TemplateResult {
    return html`<div class="detail-heading-block">
      <a
        class="back-link"
        href="/projects"
        @click=${(click: MouseEvent) => followNavigationLink(click, '/projects', this.navigate)}
        >${renderIcon('chevron-left', 14)}Projects</a
      >
      <div class="project-heading">${project.name}</div>
      ${project.cover_url ? html`<img class="project-cover" src=${project.cover_url} alt="Project cover" />` : nothing}
      <div class="panel totals-grid">${listTotals(project).map((total) => this.renderTotalCell(total))}</div>
    </div>`
  }

  private renderLink(link: ProjectLink): TemplateResult {
    const image = link.meta?.image_url
    return html`<link-preview-card .link=${link}>
      <div class="link-row">
        <a class="link-main" href=${link.url} target="_blank" rel="noopener">
          <span class="thumbnail link-thumbnail"
            >${image ? html`<img src=${image} alt="" />` : renderIcon('cube', 22, 1.6)}</span
          >
          <span class="link-labels">
            <span class="link-title">${link.meta?.title || link.url}</span>
            <span class="monospace muted link-address">${describeLinkAddress(link.url)}</span>
          </span>
        </a>
        <button
          class="button flat icon-only small link-remove"
          aria-label="Remove link"
          @click=${() => this.removeExistingLink(link.id)}
        >
          ${renderIcon('trash', 14)}
        </button>
      </div>
    </link-preview-card>`
  }

  private renderLinks(project: Project): TemplateResult {
    const links = project.links ?? []
    return html`<section class="panel links-panel" aria-label="Links">
      <div class="section-header panel-header">
        Links
        <span class="panel-actions">
          <button class="button panel-action add-link-button" @click=${this.addNewLink}>
            ${renderIcon('plus', 14)}<span class="long-label">Add link</span><span class="short-label">Add</span>
          </button>
        </span>
      </div>
      <div class="panel-body">
        ${links.length === 0 ? html`<div class="muted">No links yet</div>` : links.map((link) => this.renderLink(link))}
      </div>
    </section>`
  }

  private renderSidePanel(project: Project): TemplateResult {
    return html`<aside class="side-panel" aria-label="Parameters">
      ${this.renderHeading(project)}
      <div class="side-panel-body">
        <div class="section">
          <div class="section-header">${renderIcon('chevron-down', 14, 2.4)}Totals</div>
          <div class="section-body">${listTotals(project).map((total) => this.renderTotalRow(total))}</div>
        </div>
      </div>
      <div class="side-panel-footer">
        <button class="button danger delete-project-button" @click=${this.deleteThisProject}>
          ${renderIcon('trash', 14)}Delete project
        </button>
      </div>
    </aside>`
  }

  private renderMain(project: Project): TemplateResult {
    return html`<section class="page-main" aria-label="Main">
      <div class="page-strip"><span class="page-title">Project</span></div>
      <div class="detail-body">
        <markdown-editor
          .value=${project.notes ?? ''}
          .projectId=${project.id}
          @notes-changed=${this.handleNotesChanged}
        ></markdown-editor>
        ${this.renderLinks(project)}
        <project-files-section
          .files=${project.files ?? []}
          .projectId=${project.id}
          @files-changed=${this.handleFilesChanged}
        ></project-files-section>
      </div>
    </section>`
  }

  private renderProject(project: Project): TemplateResult {
    return html`<div class="project-detail-layout">
      ${this.renderSidePanel(project)} ${this.renderMain(project)}
      <project-prints-panel
        .prints=${project.prints ?? []}
        .files=${project.files ?? []}
        .projectId=${project.id}
        .loadHistory=${this.loadHistory}
        .navigate=${this.navigate}
        @prints-changed=${this.reload}
      ></project-prints-panel>
    </div>`
  }

  render(): TemplateResult {
    if (this.isLoading) return html`<div class="muted project-loading">Loading…</div>`
    if (!this.project) return html`<div class="muted project-missing">Project not found</div>`
    return this.renderProject(this.project)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'project-detail-page': ProjectDetailPage
  }
}
