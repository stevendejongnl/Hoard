import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { Project } from '../types'
import { getProject, deleteProject, addProjectLink, deleteProjectLink } from '../api'
import { router } from '../router'
import '../components/markdown-editor'
import '../components/project-files-section'

const styles = html`<style>
.pd-wrap { max-width: 760px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 14px; }
.pd-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.pd-stats-secondary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
@media (max-width: 600px) {
  .pd-wrap { padding: 16px; gap: 12px; }
  .pd-stats { grid-template-columns: repeat(2, 1fr); }
  .pd-stats-secondary { grid-template-columns: repeat(2, 1fr); }
}
</style>`

function _fmtHours(s: number | null): string {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function _linkHost(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

const _SETTING_LABELS: Record<string, string> = {
  layer_height: 'Layer',
  walls: 'Walls',
  infill: 'Infill',
  nozzle: 'Nozzle',
  material: 'Material',
  printer: 'Printer',
  weight_g: 'Weight',
  parts: 'Parts',
}
function _settingLabel(key: string): string {
  return _SETTING_LABELS[key] ?? key
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
    const isCoverSource = this.project.cover_link_id === linkId

    let clearCover = false
    if (isCoverSource && this.project.cover_url) {
      clearCover = confirm('This link provided the cover image. Also remove the cover image?')
    }

    await deleteProjectLink(this.project.id, linkId, clearCover)
    const updatedLinks = (this.project.links ?? []).filter(l => l.id !== linkId)
    this.project = {
      ...this.project,
      links: updatedLinks,
      cover_url: clearCover ? null : this.project.cover_url,
      cover_link_id: clearCover ? null : this.project.cover_link_id,
    }
  }

  private _stat(label: string, value: string, secondary = false) {
    return html`
      <div style="background: #1a1a1a; border: 1px solid #222; border-radius: 6px; padding: ${secondary ? '10px 12px' : '12px'}; display: flex; flex-direction: column; gap: 3px;">
        <span style="font-size: 10px; color: #555;">${label}</span>
        <span style="font-size: ${secondary ? '14px' : '18px'}; font-weight: 600; color: ${secondary ? '#aaa' : '#e0e0e0'};">${value}</span>
      </div>
    `
  }

  render() {
    if (this.loading) return html`<div style="padding: 40px; text-align: center; color: #555;">Loading...</div>`
    if (this.error || !this.project) return html`<div style="padding: 40px; text-align: center; color: #555;">Project not found.</div>`

    const p = this.project
    return html`
      ${styles}
      <div class="pd-wrap">

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

        ${p.cover_url ? html`
          <div style="width: 100%; max-height: 200px; overflow: hidden; border-radius: 8px; background: #1a1a1a;">
            <img
              src="${p.cover_url}"
              alt="Project cover"
              style="width: 100%; max-height: 200px; object-fit: cover; display: block; border-radius: 8px;"
              @error=${(e: Event) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        ` : ''}

        <!-- stats -->
        <div class="pd-stats">
          ${this._stat('prints', String(p.print_count))}
          ${this._stat('total time', _fmtHours(p.total_duration_s))}
          ${this._stat('total cost', p.total_cost != null ? '€' + p.total_cost.toFixed(2) : '—')}
          ${this._stat('filament', p.total_filament_g != null
            ? p.total_filament_g >= 1000
              ? (p.total_filament_g / 1000).toFixed(2) + ' kg'
              : p.total_filament_g.toFixed(0) + ' g'
            : '—')}
        </div>
        ${p.print_count > 1 ? html`
          <div class="pd-stats-secondary">
            ${this._stat('avg cost', p.avg_cost != null ? '€' + p.avg_cost.toFixed(2) : '—', true)}
            ${this._stat('avg time', _fmtHours(p.avg_duration_s), true)}
            ${this._stat('longest', _fmtHours(p.max_duration_s), true)}
            ${this._stat('avg filament', p.total_filament_g != null && p.print_count > 0
              ? (p.total_filament_g / p.print_count).toFixed(0) + ' g'
              : '—', true)}
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
            : (p.links ?? []).map(l => {
              const ps = l.meta?.print_settings
              const psEntries = ps ? Object.entries(ps).filter(([, v]) => v) : []
              return html`
                <div style="background: #141414; border-radius: 5px; padding: 7px 10px; margin-bottom: 5px;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                      <span style="font-size: 9px; background: #141414; color: #555; border: 1px solid #222; border-radius: 3px; padding: 1px 5px; flex-shrink: 0;">${l.label || _linkHost(l.url)}</span>
                      <a href=${l.url} target="_blank" style="font-size: 11px; color: #22d3ee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.meta?.title || l.url}</a>
                    </div>
                    <span style="font-size: 10px; color: #333; cursor: pointer; padding: 2px 6px; flex-shrink: 0;" @click=${() => this._removeLink(l.id)}>✕</span>
                  </div>
                  ${psEntries.length > 0 ? html`
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
                      ${psEntries.map(([key, val]) => html`
                        <span style="font-size: 9px; background: #1a1a1a; color: #888; border: 1px solid #2a2a2a; border-radius: 3px; padding: 1px 6px; white-space: nowrap;">
                          ${_settingLabel(key)}: ${val}
                        </span>
                      `)}
                    </div>
                  ` : ''}
                </div>
              `
            })}
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
