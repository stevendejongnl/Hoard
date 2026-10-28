import { LitElement, html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { deletePrintPhoto, uploadPrintPhoto } from '../api'
import { renderIcon } from '../icons'
import type { PrintPhoto } from '../types'

const ICON_SIZE = 20

/** The photos of a print as tiles, with a tile to add one, and a larger view of the chosen photo. */
@customElement('print-photos')
export class PrintPhotos extends LitElement {
  @property({ type: String }) jobId = ''
  @property({ attribute: false }) photos: PrintPhoto[] = []
  @property({ attribute: false }) uploadPhoto: (jobId: string, file: File) => Promise<PrintPhoto> = uploadPrintPhoto
  @property({ attribute: false }) deletePhoto: (jobId: string, photoId: number) => Promise<unknown> = deletePrintPhoto

  @state() private enlargedUrl: string | null = null
  @state() private isUploading = false

  createRenderRoot() {
    return this
  }

  private findPhotoUrl(photo: PrintPhoto): string {
    return `/api/photos/${encodeURIComponent(this.jobId)}/${encodeURIComponent(photo.filename)}`
  }

  private changePhotos(photos: PrintPhoto[]): void {
    this.photos = photos
    this.dispatchEvent(new CustomEvent('photos-changed', { detail: { photos }, bubbles: true }))
  }

  private chooseFile(): void {
    this.querySelector<HTMLInputElement>('input[type="file"]')?.click()
  }

  private async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !this.jobId) return
    input.value = ''
    this.isUploading = true
    try {
      this.changePhotos([...this.photos, await this.uploadPhoto(this.jobId, file)])
    } finally {
      this.isUploading = false
    }
  }

  private async removePhoto(photo: PrintPhoto, event: Event): Promise<void> {
    event.stopPropagation()
    await this.deletePhoto(this.jobId, photo.id)
    this.changePhotos(this.photos.filter((existing) => existing.id !== photo.id))
  }

  private renderTile(photo: PrintPhoto): TemplateResult {
    const url = this.findPhotoUrl(photo)
    return html`<div class="photo-tile" @click=${() => (this.enlargedUrl = url)}>
      <img src=${url} alt="Print photo" />
      ${photo.source === 'webcam' ? html`<span class="photo-source">webcam</span>` : nothing}
      <button
        class="button icon-only delete-photo-button"
        aria-label="Delete photo"
        @click=${(event: Event) => this.removePhoto(photo, event)}
      >
        ${renderIcon('close', 14)}
      </button>
    </div>`
  }

  private renderLightbox(): TemplateResult | typeof nothing {
    if (this.enlargedUrl === null) return nothing
    return html`<div class="photo-lightbox" @click=${() => (this.enlargedUrl = null)}>
      <img src=${this.enlargedUrl} alt="Enlarged print photo" />
    </div>`
  }

  render(): TemplateResult {
    return html`<div class="photo-grid">
        ${this.photos.map((photo) => this.renderTile(photo))}
        <button class="add-photo-tile" aria-label="Add photo" ?disabled=${this.isUploading} @click=${this.chooseFile}>
          ${renderIcon('plus', ICON_SIZE)}
        </button>
        <input type="file" accept="image/*" hidden @change=${this.upload} />
      </div>
      ${this.renderLightbox()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'print-photos': PrintPhotos
  }
}
