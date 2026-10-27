import { describe, expect, it } from 'vitest'
import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('smoke-hello')
class SmokeHello extends LitElement {
  render() {
    return html`<p>hello</p>`
  }
}

describe('test environment', () => {
  it('has a DOM', () => {
    expect(typeof document).toBe('object')
    expect(document.createElement('div').tagName).toBe('DIV')
  })

  it('renders a Lit element into its shadow root', async () => {
    const el = document.createElement('smoke-hello') as SmokeHello
    document.body.appendChild(el)
    await el.updateComplete
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('hello')
    el.remove()
  })
})
