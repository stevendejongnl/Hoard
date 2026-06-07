import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { PrintSettings } from '../types'

type SettingsKey = keyof PrintSettings

const FIELDS: { key: SettingsKey; label: string }[] = [
  { key: 'layer_height', label: 'Layer height' },
  { key: 'infill', label: 'Infill' },
  { key: 'walls', label: 'Walls' },
  { key: 'nozzle', label: 'Nozzle' },
  { key: 'nozzle_temp', label: 'Nozzle temp' },
  { key: 'bed_temp', label: 'Bed temp' },
  { key: 'material', label: 'Material' },
]

@customElement('print-settings-editor')
export class PrintSettingsEditor extends LitElement {
  @property({ attribute: false }) settings: PrintSettings | null = null
  @property({ type: String }) jobId: string = ''

  createRenderRoot() {
    return this
  }

  render() {
    const s = this.settings ?? {}
    const populated = FIELDS.filter(({ key }) => s[key] != null && s[key] !== '')
    if (populated.length === 0) return html``

    return html`
      <div style="background: #1a1a1a; border: 1px solid #222; border-radius: 8px; padding: 16px;">
        <div style="font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
          Print settings
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
          ${populated.map(
            ({ key, label }) => html`
              <div
                style="background: #141414; border: 1px solid #222; border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px;"
              >
                <span style="font-size: 10px; color: #555;">${label}</span>
                <span style="font-size: 12px; color: #aaa;">${s[key]}</span>
              </div>
            `,
          )}
        </div>
      </div>
    `
  }
}
