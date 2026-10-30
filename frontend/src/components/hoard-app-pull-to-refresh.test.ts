import { afterEach, describe, expect, it } from 'vitest'
import { html } from 'lit'
import './hoard-app'
import type { HoardApp } from './hoard-app'
import { PULL_THRESHOLD } from '../pull-to-refresh'

async function createApp(): Promise<{ app: HoardApp; readPage: () => Element }> {
  const app = document.createElement('hoard-app') as HoardApp
  app.subscribeToPayloads = () => () => undefined
  app.subscribeToRoute = () => () => undefined
  app.readCurrentRoute = () => '/'
  app.setDocumentTitle = () => undefined
  app.renderPage = () => html`<p class="page"></p>`
  document.body.appendChild(app)
  await app.updateComplete
  return { app, readPage: () => app.querySelector('.page')! }
}

function touch(element: Element, name: string, y: number): void {
  const touches = name === 'touchend' ? [] : [{ clientX: 0, clientY: y }]
  element.dispatchEvent(Object.assign(new Event(name, { bubbles: true }), { touches }))
}

async function pull(app: HoardApp, distance: number): Promise<void> {
  const page = app.querySelector('.page')!
  touch(page, 'touchstart', 100)
  touch(page, 'touchmove', 100 + distance)
  await app.updateComplete
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('pull to refresh', () => {
  it('shows nothing when nobody pulls', async () => {
    const { app } = await createApp()
    expect(app.querySelector('.pull-indicator')).toBeNull()
  })

  it('shows the indicator while pulling', async () => {
    const { app } = await createApp()
    await pull(app, 60)
    expect(app.querySelector('.pull-indicator')).not.toBeNull()
  })

  it('loads the page again after a full pull, and removes the indicator', async () => {
    const { app, readPage } = await createApp()
    const before = readPage()
    await pull(app, PULL_THRESHOLD * 2)
    touch(readPage(), 'touchend', 0)
    await app.updateComplete
    expect(readPage()).not.toBe(before)
    expect(app.querySelector('.pull-indicator')).toBeNull()
  })

  it('leaves the page alone after a short pull', async () => {
    const { app, readPage } = await createApp()
    const before = readPage()
    await pull(app, 20)
    touch(readPage(), 'touchend', 0)
    await app.updateComplete
    expect(readPage()).toBe(before)
    expect(app.querySelector('.pull-indicator')).toBeNull()
  })
})
