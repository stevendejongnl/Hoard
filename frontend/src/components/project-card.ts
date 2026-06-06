import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { Project } from '../types'

function _fmtHours(s: number | null): string {
  if (!s) return '0h'
  const h = Math.round(s / 3600)
  return h < 1 ? '<1h' : `${h}h`
}

function _linkHost(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

@customElement('project-card')
export class ProjectCard extends LitElement {
  @property({ type: Object }) project!: Project

  createRenderRoot() { return this }

  render() {
    const p = this.project
    return html`
      <div
        style="background: #1a1a1a; border: 1px solid #222; border-radius: 8px; padding: 16px; cursor: pointer; display: flex; flex-direction: column; gap: 10px;"
        @click=${() => window.router.navigate(`/projects/${p.id}` as any)}
      >
        ${p.cover_url ? html`
          <div style="margin: -16px -16px 10px; height: 100px; overflow: hidden; border-radius: 8px 8px 0 0;">
            <img
              src="${p.cover_url}"
              alt=""
              style="width: 100%; height: 100%; object-fit: cover; display: block;"
              @error=${(e: Event) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
            />
          </div>
        ` : ''}
        <div style="display: flex; flex-direction: column; gap: 3px;">
          <span style="font-size: 13px; font-weight: 600; color: #e0e0e0;">${p.name}</span>
        </div>
        <div style="display: flex; gap: 8px; font-size: 11px; flex-wrap: wrap;">
          <span style="color: #888;"><span style="color: #22d3ee;">${p.print_count}</span> prints</span>
          ${p.total_cost != null ? html`
            <span style="color: #333;">·</span>
            <span style="color: #888;">€${p.total_cost.toFixed(2)}</span>
          ` : ''}
          ${p.total_duration_s != null ? html`
            <span style="color: #333;">·</span>
            <span style="color: #888;">${_fmtHours(p.total_duration_s)}</span>
          ` : ''}
        </div>
        ${p.links && p.links.length > 0 ? html`
          <div style="display: flex; gap: 5px; flex-wrap: wrap;">
            ${p.links.slice(0, 3).map(l => html`
              <span style="font-size: 9px; background: #141414; color: #555; border: 1px solid #222; border-radius: 3px; padding: 2px 6px;">
                ${l.label || _linkHost(l.url)}
              </span>
            `)}
          </div>
        ` : ''}
        ${p.notes ? html`
          <div style="font-size: 10px; color: #555; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${p.notes.split('\n')[0].replace(/^#+\s*/, '')}
          </div>
        ` : ''}
      </div>
    `
  }
}
