import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { marked } from 'marked'
import type { PrintJob, GcodeMeta } from '../types'
import { getPrintJob, updatePrintJob } from '../api'
import { router } from '../router'
import '../components/print-settings-editor'
import '../components/print-photos'

const styles = html`<style>
  .ppd-wrap {
    max-width: 760px;
    margin: 0 auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .ppd-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  @media (max-width: 600px) {
    .ppd-wrap {
      padding: 16px;
      gap: 12px;
    }
    .ppd-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .ppd-section {
    background: var(--surface);
    border-radius: 8px;
    padding: 16px;
    border: 1px solid var(--border);
  }
  .ppd-section-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 12px;
  }
  .ppd-meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .ppd-meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ppd-meta-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ppd-meta-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }
  .ppd-meta-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ppd-meta-link:hover {
    text-decoration: underline;
  }
</style>`

function _fmtDuration(s: number | null): string {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function _fmtFilament(g: number | null): string {
  if (g == null) return '—'
  if (g >= 1000) return (g / 1000).toFixed(2) + ' kg'
  return g.toFixed(0) + ' g'
}

function _fmtDate(time: string | null): string {
  if (!time) return '—'
  try {
    return new Date(time).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return time
  }
}

@customElement('print-detail-page')
export class PrintDetailPage extends LitElement {
  createRenderRoot() {
    return this
  }

  @state() job: PrintJob | null = null
  @state() loading = true
  @state() error = false

  // Notes state
  @state() private _notesEditing = false
  @state() private _notesDraft = ''
  @state() private _notesSaved = ''
  @state() private _notesSaving = false

  connectedCallback() {
    super.connectedCallback()
    const id = router.printJobId
    if (id) this._load(id)
    else this.error = true
  }

  private async _load(jobId: string) {
    this.loading = true
    try {
      this.job = await getPrintJob(jobId)
      this._notesSaved = this.job.notes ?? ''
      this._notesDraft = this._notesSaved
    } catch {
      this.error = true
    } finally {
      this.loading = false
    }
  }

  private _stat(label: string, value: string) {
    return html`
      <div
        style="background: #1a1a1a; border: 1px solid #222; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 3px;"
      >
        <span style="font-size: 10px; color: #555;">${label}</span>
        <span style="font-size: 18px; font-weight: 600; color: #e0e0e0;">${value}</span>
      </div>
    `
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  private _startNotesEdit() {
    this._notesDraft = this._notesSaved
    this._notesEditing = true
    this.updateComplete.then(() => {
      const ta = this.querySelector<HTMLTextAreaElement>('textarea[data-notes]')
      if (!ta) return
      ta.focus()
      ta.selectionStart = ta.selectionEnd = ta.value.length
      ta.style.height = ta.scrollHeight + 'px'
    })
  }

  private async _saveNotes() {
    if (!this.job) return
    this._notesEditing = false
    const prev = this._notesSaved
    this._notesSaved = this._notesDraft
    this._notesSaving = true
    try {
      await updatePrintJob(this.job.job_id, { notes: this._notesDraft })
      if (this.job) this.job = { ...this.job, notes: this._notesDraft }
    } catch {
      this._notesSaved = prev
      this._notesDraft = prev
    } finally {
      this._notesSaving = false
    }
  }

  // ── Gcode Meta ───────────────────────────────────────────────────────────

  private _renderGcodeMeta() {
    const meta = this.job?.gcode_meta
    if (!meta || !Object.values(meta).some((v) => v != null && v !== '')) return html``

    const labelMap: Record<string, string> = {
      layer_height: 'Layer height',
      first_layer_height: 'First layer',
      filament_weight_g: 'Filament weight',
      estimated_time_s: 'Estimated time',
      nozzle_diameter: 'Nozzle',
      filament_type: 'Filament type',
      nozzle_temp: 'Nozzle temp',
      bed_temp: 'Bed temp',
      slicer: 'Slicer',
      slicer_version: 'Slicer version',
      layer_count: 'Layers',
      object_height: 'Object height',
      source_url: 'Source',
      project_name: 'Project',
    }

    const formatValue = (key: string, val: string | number): string => {
      if (key === 'layer_height' || key === 'first_layer_height' || key === 'nozzle_diameter') return `${val} mm`
      if (key === 'filament_weight_g') return `${val} g`
      if (key === 'estimated_time_s') {
        const s = Number(val)
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        return h > 0 ? `${h}h ${m}m` : `${m}m`
      }
      if (key === 'nozzle_temp' || key === 'bed_temp') return `${val}°C`
      if (key === 'object_height') return `${val} mm`
      return String(val)
    }

    const entries = Object.entries(meta).filter(([, v]) => v != null && v !== '')

    return html`
      <div class="ppd-section">
        <div class="ppd-section-title">Slicer Info</div>
        <div class="ppd-meta-grid">
          ${entries.map(([key, val]) => {
            const label = labelMap[key] ?? key.replace(/_/g, ' ')
            const display = formatValue(key, val as string | number)
            if (key === 'source_url' && String(val).startsWith('http')) {
              return html`<div class="ppd-meta-item">
                <span class="ppd-meta-label">${label}</span
                ><a href="${val}" target="_blank" rel="noopener" class="ppd-meta-value ppd-meta-link">${val}</a>
              </div>`
            }
            return html`<div class="ppd-meta-item">
              <span class="ppd-meta-label">${label}</span><span class="ppd-meta-value">${display}</span>
            </div>`
          })}
        </div>
      </div>
    `
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (this.loading) return html`<div style="padding: 40px; text-align: center; color: #555;">Loading…</div>`
    if (this.error || !this.job)
      return html`<div style="padding: 40px; text-align: center; color: #555;">Print job not found.</div>`

    const j = this.job
    const spoolLabel = j.spool
      ? [j.spool.brand, j.spool.material].filter(Boolean).join(' ')
      : j.spool_id
        ? `spool #${j.spool_id}`
        : '—'

    return html`
      ${styles}
      <div class="ppd-wrap">
        <!-- breadcrumb -->
        <div style="display: flex; align-items: center; gap: 6px; font-size: 10px; color: #555;">
          <span style="cursor: pointer;" @click=${() => router.navigate('/history')}>← history</span>
          ${j.project
            ? html`
                <span>·</span>
                <span
                  style="cursor: pointer; color: #22d3ee;"
                  @click=${() => router.navigate(`/projects/${j.project!.id}` as `/projects/${string}`)}
                  >${j.project.name}</span
                >
              `
            : ''}
        </div>

        <!-- header: filename + date -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
          <span style="font-size: 18px; font-weight: 600; color: #e0e0e0; word-break: break-word;">${j.filename}</span>
          <span style="font-size: 11px; color: #555; white-space: nowrap; flex-shrink: 0; padding-top: 4px;"
            >${_fmtDate(j.time ?? null)}</span
          >
        </div>

        <!-- stats -->
        <div class="ppd-stats">
          ${this._stat('duration', _fmtDuration(j.duration_s ?? null))}
          ${this._stat('cost', j.cost_total != null ? '€' + j.cost_total.toFixed(2) : '—')}
          ${this._stat('filament', _fmtFilament(j.filament_g ?? null))} ${this._stat('spool', spoolLabel)}
        </div>

        <!-- cost breakdown -->
        ${j.cost_filament != null || j.cost_electricity != null || j.avg_watts != null || j.avg_eur_per_kwh != null
          ? html`
              <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                ${[
                  { label: 'filament cost', value: j.cost_filament != null ? '€' + j.cost_filament.toFixed(2) : '—' },
                  {
                    label: 'electricity',
                    value: j.cost_electricity != null ? '€' + j.cost_electricity.toFixed(2) : '—',
                  },
                  { label: 'avg watts', value: j.avg_watts != null ? j.avg_watts + 'w' : '—' },
                  { label: '€/kWh', value: j.avg_eur_per_kwh != null ? '€' + j.avg_eur_per_kwh.toFixed(3) : '—' },
                ].map(
                  ({ label, value }) => html`
                    <div
                      style="background: #141414; border: 1px solid #1e1e1e; border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px;"
                    >
                      <span style="font-size: 10px; color: #555;">${label}</span>
                      <span style="font-size: 14px; color: #aaa;">${value}</span>
                    </div>
                  `,
                )}
              </div>
            `
          : ''}

        <!-- gcode meta -->
        ${this._renderGcodeMeta()}

        <!-- print settings -->
        <print-settings-editor .settings=${j.settings} .jobId=${j.job_id}></print-settings-editor>

        <!-- photos -->
        <print-photos
          .jobId=${j.job_id}
          .photos=${j.photos ?? []}
          @photos-changed=${(e: CustomEvent) => {
            if (this.job) this.job = { ...this.job, photos: e.detail.photos }
          }}
        ></print-photos>

        <!-- notes -->
        ${this._notesEditing
          ? html`
              <div style="background: #1a1a1a; border: 1px solid #22d3ee44; border-radius: 8px; padding: 16px;">
                <div
                  style="font-size: 10px; color: #555; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;"
                >
                  Notes
                </div>
                <textarea
                  data-notes
                  style="width: 100%; background: transparent; border: none; color: #ccc; font-size: 12px; line-height: 1.7; resize: none; outline: none; font-family: var(--font); min-height: 80px; box-sizing: border-box;"
                  .value=${this._notesDraft}
                  @input=${(e: Event) => {
                    const ta = e.target as HTMLTextAreaElement
                    this._notesDraft = ta.value
                    ta.style.height = 'auto'
                    ta.style.height = ta.scrollHeight + 'px'
                  }}
                  @blur=${this._saveNotes}
                ></textarea>
              </div>
            `
          : html`
              <div
                style="background: #1a1a1a; border: 1px solid #222; border-radius: 8px; padding: 16px; cursor: text;"
                @click=${this._startNotesEdit}
              >
                <div
                  style="font-size: 10px; color: #555; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;"
                >
                  Notes
                </div>
                ${this._notesSaved
                  ? html`<div class="md-prose" .innerHTML=${marked.parse(this._notesSaved) as string}></div>`
                  : html`<div style="font-size: 12px; color: #333; font-style: italic;">Click to add notes…</div>`}
                <div style="margin-top: 8px; font-size: 9px; color: #333;">click to edit</div>
              </div>
            `}
      </div>
    `
  }
}
