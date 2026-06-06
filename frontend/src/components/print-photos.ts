import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { PrintPhoto } from '../types'
import { uploadPrintPhoto, deletePrintPhoto } from '../api'

@customElement('print-photos')
export class PrintPhotos extends LitElement {
  @property({ type: String }) jobId: string = ''
  @property({ attribute: false }) photos: PrintPhoto[] = []

  @state() private _lightboxUrl: string | null = null
  @state() private _uploading = false
  @state() private _hoverPhotoId: number | null = null

  createRenderRoot() {
    return this
  }

  private _photoUrl(photo: PrintPhoto): string {
    return `/api/photos/${encodeURIComponent(this.jobId)}/${encodeURIComponent(photo.filename)}`
  }

  private _openLightbox(url: string) {
    this._lightboxUrl = url
  }

  private _closeLightbox() {
    this._lightboxUrl = null
  }

  private _triggerUpload() {
    const input = this.querySelector<HTMLInputElement>('input[type=file]')
    input?.click()
  }

  private async _onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !this.jobId) return
    input.value = ''
    this._uploading = true
    try {
      const photo = await uploadPrintPhoto(this.jobId, file)
      const updated = [...this.photos, photo]
      this.photos = updated
      this.dispatchEvent(new CustomEvent('photos-changed', { detail: { photos: updated }, bubbles: true }))
    } finally {
      this._uploading = false
    }
  }

  private async _delete(photo: PrintPhoto, e: Event) {
    e.stopPropagation()
    if (!this.jobId) return
    await deletePrintPhoto(this.jobId, photo.id)
    const updated = this.photos.filter((p) => p.id !== photo.id)
    this.photos = updated
    this.dispatchEvent(new CustomEvent('photos-changed', { detail: { photos: updated }, bubbles: true }))
  }

  render() {
    return html`
      <div style="background: #1a1a1a; border: 1px solid #222; border-radius: 8px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span style="font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.05em;">Photos</span>
          <button
            style="background: transparent; border: 1px solid #22d3ee33; color: #22d3ee; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer;"
            @click=${this._triggerUpload}
            ?disabled=${this._uploading}
          >
            ${this._uploading ? 'uploading…' : '+ upload'}
          </button>
        </div>

        <input type="file" accept="image/*" style="display: none;" @change=${this._onFileChange} />

        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start;">
          ${this.photos.map(
            (photo) => html`
              <div
                style="position: relative; width: 80px; height: 60px; cursor: pointer; border-radius: 4px; overflow: hidden; flex-shrink: 0;"
                @mouseenter=${() => {
                  this._hoverPhotoId = photo.id
                  this.requestUpdate()
                }}
                @mouseleave=${() => {
                  this._hoverPhotoId = null
                  this.requestUpdate()
                }}
                @click=${() => this._openLightbox(this._photoUrl(photo))}
              >
                <img
                  src="${this._photoUrl(photo)}"
                  alt="print photo"
                  style="width: 80px; height: 60px; object-fit: cover; display: block; border-radius: 4px;"
                  @error=${(e: Event) => {
                    ;(e.target as HTMLImageElement).style.opacity = '0.2'
                  }}
                />
                ${photo.source === 'webcam'
                  ? html`
                      <span
                        style="position: absolute; bottom: 3px; left: 3px; font-size: 8px; background: #00000099; color: #aaa; padding: 1px 4px; border-radius: 3px; pointer-events: none;"
                        >webcam</span
                      >
                    `
                  : ''}
                ${this._hoverPhotoId === photo.id
                  ? html`
                      <button
                        style="position: absolute; top: 3px; right: 3px; background: #000000cc; border: none; color: #ccc; border-radius: 3px; width: 18px; height: 18px; font-size: 9px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;"
                        @click=${(e: Event) => this._delete(photo, e)}
                      >
                        ✕
                      </button>
                    `
                  : ''}
              </div>
            `,
          )}
          ${this.photos.length === 0
            ? html`
                <div
                  style="width: 80px; height: 60px; border: 1px dashed #333; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #333; font-size: 18px;"
                  @click=${this._triggerUpload}
                >
                  +
                </div>
              `
            : ''}
        </div>
      </div>

      ${this._lightboxUrl
        ? html`
            <div
              style="position: fixed; inset: 0; background: #000000cc; z-index: 999; display: flex; align-items: center; justify-content: center; cursor: zoom-out;"
              @click=${this._closeLightbox}
            >
              <img
                src="${this._lightboxUrl}"
                style="max-width: 90vw; max-height: 90vh; border-radius: 6px; object-fit: contain; pointer-events: none;"
                alt="enlarged photo"
              />
            </div>
          `
        : ''}
    `
  }
}
