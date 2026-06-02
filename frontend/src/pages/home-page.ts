import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'

import '../components/live-status'
import '../components/pi-strip'
import '../components/printer-controls'
import '../components/webcam-view'
import '../components/history-preview'
import '../components/cost-predictor'
import '../components/spools-preview'
import '../components/file-browser-modal'

@customElement('home-page')
export class HomePage extends LitElement {
  createRenderRoot() { return this }

  @state() fileBrowserOpen = false
  @state() predictFilename = ''

  render() {
    return html`
      <style>
        .main { max-width: 940px; margin: 0 auto; padding: 28px 28px 60px; display: flex; flex-direction: column; gap: 0; }
        .divider { height: 1px; background: #222; margin: 28px 0; }
      </style>

      <div class="main">
        <live-status></live-status>
        <printer-controls style="margin-top:10px"></printer-controls>
        <webcam-view style="margin-top:10px"></webcam-view>
        <pi-strip style="margin-top:10px"></pi-strip>

        <div class="divider"></div>

        <history-preview></history-preview>

        <div class="divider"></div>

        <cost-predictor
          .filename=${this.predictFilename}
          @open-file-browser=${() => { this.fileBrowserOpen = true }}
          @file-selected-for-predict=${(e: CustomEvent) => {
            this.predictFilename = e.detail.filename
            this.fileBrowserOpen = false
          }}
        ></cost-predictor>

        <div class="divider"></div>

        <spools-preview></spools-preview>
      </div>

      <file-browser-modal
        .open=${this.fileBrowserOpen}
        @close=${() => { this.fileBrowserOpen = false }}
        @file-selected=${(e: CustomEvent) => {
          this.predictFilename = e.detail.filename
          this.fileBrowserOpen = false
        }}
      ></file-browser-modal>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'home-page': HomePage
  }
}
