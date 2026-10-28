import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { createProject, getProjects } from '../api'
import { followNavigationLink } from '../navigation'
import { renderIcon } from '../icons'
import {
  PROJECT_SORT_LABELS,
  calculateProjectTotals,
  filterProjectsByName,
  formatCost,
  formatDuration,
  formatFilament,
  sortProjects,
} from '../project-list'
import type { ProjectSortOrder } from '../project-list'
import { router } from '../router'
import type { Project } from '../types'
import '../styles/projects.css'

type NavigateFunction = (path: string) => void
type LoadState = 'loading' | 'ready' | 'error'

interface TotalsText {
  projectCount: string
  printCount: string
  filament: TemplateResult | string
  cost: string
}

const NO_VALUE = '—'
const NO_TOTALS: TotalsText = { projectCount: NO_VALUE, printCount: NO_VALUE, filament: NO_VALUE, cost: NO_VALUE }

const navigateWithRouter: NavigateFunction = (path) => router.navigate(path as Parameters<typeof router.navigate>[0])

const SORT_ORDERS = Object.keys(PROJECT_SORT_LABELS) as ProjectSortOrder[]

function describePrintCount(project: Project): string {
  const noun = project.print_count === 1 ? 'print' : 'prints'
  return `${project.print_count} ${noun}`
}

/** The list of projects: search and sort in the side panel, a card for each project in the middle. */
@customElement('projects-page')
export class ProjectsPage extends LitElement {
  @property({ attribute: false }) loadProjects: () => Promise<Project[]> = getProjects
  @property({ attribute: false }) createProject: (name: string) => Promise<Project> = createProject
  @property({ attribute: false }) askForProjectName: () => string | null = () => window.prompt('Project name:')
  @property({ attribute: false }) navigate: NavigateFunction = navigateWithRouter

  @state() private projects: Project[] = []
  @state() private loadState: LoadState = 'loading'
  @state() private query = ''
  @state() private order: ProjectSortOrder = 'recent'

  createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.reload()
  }

  private async reload(): Promise<void> {
    try {
      this.projects = await this.loadProjects()
      this.loadState = 'ready'
    } catch {
      this.loadState = 'error'
    }
  }

  private async handleNewProject(): Promise<void> {
    const name = this.askForProjectName()?.trim()
    if (!name) return
    const project = await this.createProject(name)
    this.navigate(`/projects/${String(project.id)}`)
  }

  private handleQueryInput(event: Event): void {
    this.query = (event.target as HTMLInputElement).value
  }

  private handleOrderChange(event: Event): void {
    this.order = (event.target as HTMLSelectElement).value as ProjectSortOrder
  }

  private findVisibleProjects(): Project[] {
    return sortProjects(filterProjectsByName(this.projects, this.query), this.order)
  }

  private renderSearchSection(): TemplateResult {
    return html`<div class="section">
      <div class="section-header">${renderIcon('chevron-down', 14, 2.4)}Search</div>
      <div class="section-body search-section-body">
        <label class="value-field search-field">
          ${renderIcon('search', 14)}
          <input
            type="search"
            placeholder="Filter projects"
            aria-label="Filter projects"
            .value=${this.query}
            @input=${this.handleQueryInput}
          />
        </label>
      </div>
    </div>`
  }

  private renderSortOption(order: ProjectSortOrder): TemplateResult {
    return html`<option value=${order} ?selected=${order === this.order}>${PROJECT_SORT_LABELS[order]}</option>`
  }

  private renderSortSection(): TemplateResult {
    return html`<div class="section">
      <div class="section-header">${renderIcon('chevron-down', 14, 2.4)}Sort</div>
      <div class="section-body">
        <div class="parameter-row">
          <span class="parameter-label">Order by</span>
          <label class="value-field select-field sort-field">
            <select class="sort-select" aria-label="Order by" @change=${this.handleOrderChange}>
              ${SORT_ORDERS.map((order) => this.renderSortOption(order))}
            </select>
            ${renderIcon('chevron-down', 12, 2.4)}
          </label>
        </div>
      </div>
    </div>`
  }

  private renderTotalRow(label: string, total: string, content: TemplateResult | string): TemplateResult {
    return html`<div class="parameter-row">
      <span class="parameter-label">${label}</span>
      <span class="value-field" data-total=${total}>${content}</span>
    </div>`
  }

  private renderTotalsSection(): TemplateResult {
    if (this.loadState !== 'ready') return this.renderTotalsSectionOf(NO_TOTALS)
    const totals = calculateProjectTotals(this.projects)
    return this.renderTotalsSectionOf({
      projectCount: String(totals.projectCount),
      printCount: String(totals.printCount),
      filament: html`${totals.filamentGrams.toFixed(1)}<span class="value-unit">g</span>`,
      cost: formatCost(totals.cost),
    })
  }

  private renderTotalsSectionOf(totals: TotalsText): TemplateResult {
    return html`<div class="section totals-section">
      <div class="section-header">${renderIcon('chevron-down', 14, 2.4)}Totals</div>
      <div class="section-body">
        ${this.renderTotalRow('Projects', 'projects', totals.projectCount)}
        ${this.renderTotalRow('Prints', 'prints', totals.printCount)}
        ${this.renderTotalRow('Filament', 'filament', totals.filament)}
        ${this.renderTotalRow('Cost', 'cost', totals.cost)}
      </div>
    </div>`
  }

  private renderNewProjectButton(): TemplateResult {
    return html`<div class="side-panel-footer">
      <button class="button primary new-project-button" @click=${this.handleNewProject}>
        ${renderIcon('plus', 14)}New project
      </button>
    </div>`
  }

  private renderStatistic(label: string, value: string, className = ''): TemplateResult {
    return html`<div>
      <div class="statistic-label muted">${label}</div>
      <div class="monospace statistic-value ${className}">${value}</div>
    </div>`
  }

  private renderThumbnail(project: Project): TemplateResult {
    if (project.cover_url) return html`<div class="card-thumbnail"><img src=${project.cover_url} alt="" /></div>`
    return html`<div class="card-thumbnail">${renderIcon('cube', 40, 1.4)}</div>`
  }

  private renderCard(project: Project): TemplateResult {
    const path = `/projects/${String(project.id)}`
    return html`<a
      class="panel project-card"
      href=${path}
      @click=${(click: MouseEvent) => followNavigationLink(click, path, this.navigate)}
    >
      ${this.renderThumbnail(project)}
      <div class="card-body">
        <span class="project-name">${project.name}</span>
        <div class="card-statistics">
          ${this.renderStatistic('Prints', String(project.print_count))}
          ${this.renderStatistic('Time', formatDuration(project.total_duration_s))}
          ${this.renderStatistic('Filament', formatFilament(project.total_filament_g))}
          ${this.renderStatistic('Cost', formatCost(project.total_cost), 'accented-value')}
        </div>
        <span class="card-summary muted"
          >${describePrintCount(project)} · ${formatDuration(project.total_duration_s)}</span
        >
        <span class="card-cost monospace">${formatCost(project.total_cost)}</span>
      </div>
    </a>`
  }

  private renderMessage(message: string): TemplateResult {
    return html`<div class="projects-empty muted">${message}</div>`
  }

  private renderCards(visibleProjects: Project[]): TemplateResult | typeof nothing {
    if (this.loadState === 'loading') return this.renderMessage('Loading projects…')
    if (this.loadState === 'error') return this.renderMessage('Could not load the projects')
    if (visibleProjects.length === 0) return this.renderMessage('No projects found')
    return html`<div class="project-grid">${visibleProjects.map((project) => this.renderCard(project))}</div>`
  }

  render(): TemplateResult {
    const visibleProjects = this.findVisibleProjects()
    return html`<div class="projects-layout">
      <aside class="side-panel" aria-label="Parameters">
        <div class="side-panel-body">
          ${this.renderSearchSection()} ${this.renderSortSection()} ${this.renderTotalsSection()}
        </div>
        ${this.renderNewProjectButton()}
      </aside>
      <section class="page-main" aria-label="Main">
        <div class="page-strip">
          <span class="page-title">Projects</span>
          <span class="monospace muted project-count"
            >${this.loadState === 'ready' ? this.projects.length : NO_VALUE}</span
          >
        </div>
        <div class="page-body">${this.renderCards(visibleProjects)}</div>
      </section>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'projects-page': ProjectsPage
  }
}
