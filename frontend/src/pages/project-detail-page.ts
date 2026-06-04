import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { Project } from '../types'
import { getProject, deleteProject, addProjectLink, deleteProjectLink, refreshProjectPrint } from '../api'
import { router } from '../router'
import '../components/markdown-editor'
import '../components/project-files-section'

function _fmtHours(s: number | null): string {
  if (!s) return '—'
  const h = Math.round(s / 3600)
  return h < 1 ? '<1h' : `${h}h`
}

function _linkHost(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

@customElement('project-detail-page')
export class ProjectDetailPage extends LitElement {
  createRenderRoot() { return this }

  @state() project: Project | null = null
  @state() loading = true
  @state() error = false

  connectedCallback() {
    super.connectedCallback()
    const id = router.projectId
    if (id) this._load(id)
    else this.error = true
  }

  private async _load(id: number) {
    this.loading = true
    try {
      this.project = await getProject(id)
    } catch {
      this.error = true
    } finally {
      this.loading = false
    }
  }

  @state() private _refreshing = false

  private async _refreshCosts() {
    if (!this.project || this._refreshing) return
    this._refreshing = true
    this.requestUpdate()
    const prints = this.project.prints ?? []
    await Promise.all(prints.map(p => refreshProjectPrint(this.project!.id, p.job_id).catch(() => null)))
    this.project = await getProject(this.project.id)
    this._refreshing = false
  }

  private async _delete() {
    if (!this.project) return
    if (!confirm(`Delete project "${this.project.name}"? This cannot be undone.`)) return
    await deleteProject(this.project.id)
    router.navigate('/projects')
  }

  private async _addLink() {
    if (!this.project) return
    const url = prompt('Enter URL:')
    if (!url?.trim()) return
    const label = prompt('Label (e.g. "printables", optional):') ?? undefined
    const link = await addProjectLink(this.project.id, { url: url.trim(), label: label || undefined })
    this.project = { ...this.project, links: [...(this.project.links ?? []), link] }
  }

  private async _removeLink(linkId: number) {
    if (!this.project) return
    await deleteProjectLink(this.project.id, linkId)
    this.project = { ...this.project, links: (this.project.links ?? []).filter(l => l.id !== linkId) }
  }

  private _stat(label: string, value: string) {
    return html`
      <div style="background: #1a1a1a; border: 1px solid #222; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 3px;">
        <span style="font-size: 10px; color: #555;">${label}</span>
        <span style="font-size: 18px; font-weight: 600; color: #e0e0e0;">${value}</span>
      </div>
    `
  }

  render() {
    if (this.loading) return html`<div style="padding: 40px; text-align: center; color: #555;">Loading...</div>`
    if (this.error || !this.project) return html`<div style="padding: 40px; text-align: center; color: #555;">Project not found.</div>`

    const p = this.project
    return html`
      <div style="max-width: 760px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 14px;">

        <!-- header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span
              style="font-size: 10px; color: #555; cursor: pointer;"
              @click=${() => router.navigate('/projects')}
            >← projects</span>
            <span style="font-size: 18px; font-weight: 600; color: #e0e0e0;">${p.name}</span>
          </div>
          <button
            style="background: transparent; border: 1px solid #33181888; color: #ef4444; border-radius: 6px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
            @click=${this._delete}
          >delete</button>
        </div>

        <!-- stats bar -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
          ${this._stat('prints', String(p.print_count))}
          ${this._stat('total time', _fmtHours(p.total_duration_s))}
          ${this._stat('total cost', p.total_cost != null ? '€' + p.total_cost.toFixed(2) : '—')}
          ${this._stat('filament', p.total_filament_g != null ? p.total_filament_g.toFixed(0) + 'g' : '—')}
        </div>
        ${p.print_count > 0 ? html`
          <div style="display: flex; justify-content: flex-end;">
            <button
              style="background: transparent; border: 1px solid #333; color: #555; border-radius: 4px; padding: 4px 10px; font-size: 10px; cursor: pointer;"
              ?disabled=${this._refreshing}
              @click=${this._refreshCosts}
            >${this._refreshing ? 'refreshing…' : '↻ refresh costs'}</button>
          </div>
        ` : ''}

        <!-- notes (markdown editor) -->
        <markdown-editor
          .value=${p.notes ?? ''}
          .projectId=${p.id}
          @notes-changed=${(e: CustomEvent) => {
            if (this.project) this.project = { ...this.project, notes: e.detail.value }
          }}
        ></markdown-editor>

        <!-- links -->
        <div style="background: #1a1a1a; border: 1px solid #222; border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.05em;">Links</span>
            <button
              style="background: transparent; border: 1px solid #22d3ee33; color: #22d3ee; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer;"
              @click=${this._addLink}
            >+ add</button>
          </div>
          ${(p.links ?? []).length === 0
            ? html`<div style="font-size: 11px; color: #333;">No links yet.</div>`
            : (p.links ?? []).map(l => html`
              <div style="display: flex; align-items: center; justify-content: space-between; background: #141414; border-radius: 5px; padding: 7px 10px; margin-bottom: 5px;">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                  <span style="font-size: 9px; background: #141414; color: #555; border: 1px solid #222; border-radius: 3px; padding: 1px 5px; flex-shrink: 0;">${l.label || _linkHost(l.url)}</span>
                  <a href=${l.url} target="_blank" style="font-size: 11px; color: #22d3ee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.url}</a>
                </div>
                <span style="font-size: 10px; color: #333; cursor: pointer; padding: 2px 6px; flex-shrink: 0;" @click=${() => this._removeLink(l.id)}>✕</span>
              </div>
            `)}
        </div>

        <!-- files -->
        <project-files-section
          .project=${p}
          @project-updated=${(e: CustomEvent) => { this.project = e.detail }}
          @reload-project=${() => { if (p.id) this._load(p.id) }}
        ></project-files-section>

      </div>
    `
  }
}
