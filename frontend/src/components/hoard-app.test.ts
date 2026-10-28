import { afterEach, describe, expect, it } from 'vitest'
import { html } from 'lit'
import './hoard-app'
import type { HoardApp } from './hoard-app'
import type { ServerSentEventPayload } from '../server-sent-events-client'

class FakeEnvironment {
  route = '/'
  documentTitle = ''
  isStreamUnsubscribed = false
  isRouteUnsubscribed = false
  private payloadHandler: ((payload: ServerSentEventPayload) => void) | null = null
  private routeHandler: ((route: string) => void) | null = null

  subscribeToPayloads = (handler: (payload: ServerSentEventPayload) => void) => {
    this.payloadHandler = handler
    return () => {
      this.isStreamUnsubscribed = true
    }
  }

  subscribeToRoute = (handler: (route: string) => void) => {
    this.routeHandler = handler
    return () => {
      this.isRouteUnsubscribed = true
    }
  }

  readCurrentRoute = () => this.route
  setDocumentTitle = (title: string) => {
    this.documentTitle = title
  }
  renderPage = (route: string) => html`<p class="page">page for ${route}</p>`

  receivePrinterState(state: string, progress = 0): void {
    this.payloadHandler?.({
      type: 'printer_state',
      data: {
        state,
        filename: 'part.gcode',
        progress,
        layer: null,
        layer_total: null,
        time_remaining: 0,
        filament_used: 0,
        speed: 0,
        z_position: 0,
      },
    })
  }

  navigateTo(route: string): void {
    this.route = route
    this.routeHandler?.(route)
  }
}

async function createHoardApp(environment: FakeEnvironment): Promise<HoardApp> {
  const element = document.createElement('hoard-app') as HoardApp
  element.subscribeToPayloads = environment.subscribeToPayloads
  element.subscribeToRoute = environment.subscribeToRoute
  element.readCurrentRoute = environment.readCurrentRoute
  element.setDocumentTitle = environment.setDocumentTitle
  element.renderPage = environment.renderPage
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('printer app layout', () => {
  it('puts the top bar, the page, the status bar and the phone tabs together', async () => {
    const element = await createHoardApp(new FakeEnvironment())
    expect(element.querySelector('top-navigation')).not.toBeNull()
    expect(element.querySelector('main.app-content .page')).not.toBeNull()
    expect(element.querySelector('status-bar')).not.toBeNull()
    expect(element.querySelector('bottom-tabs')).not.toBeNull()
  })

  it('shows the page for the current route', async () => {
    const environment = new FakeEnvironment()
    environment.route = '/history'
    const element = await createHoardApp(environment)
    expect(element.querySelector('.page')?.textContent).toBe('page for /history')
  })

  it('gives the route to both navigations', async () => {
    const environment = new FakeEnvironment()
    environment.route = '/spools'
    const element = await createHoardApp(environment)
    expect(element.querySelector('top-navigation')?.getAttribute('route')).toBe('/spools')
    expect(element.querySelector('bottom-tabs')?.getAttribute('route')).toBe('/spools')
  })

  it('shows the new page when the route changes', async () => {
    const environment = new FakeEnvironment()
    const element = await createHoardApp(environment)
    environment.navigateTo('/projects')
    await element.updateComplete
    expect(element.querySelector('.page')?.textContent).toBe('page for /projects')
    expect(element.querySelector('top-navigation')?.getAttribute('route')).toBe('/projects')
  })
})

describe('printer app printer state', () => {
  it('gives the printer state from the stream to the top bar and the status bar', async () => {
    const environment = new FakeEnvironment()
    const element = await createHoardApp(environment)
    environment.receivePrinterState('printing', 42)
    await element.updateComplete
    expect(element.querySelector('top-navigation')?.getAttribute('printerstate')).toBe('printing')
    expect(element.querySelector('status-bar')?.getAttribute('printerstate')).toBe('printing')
  })

  it('puts the print progress in the document title', async () => {
    const environment = new FakeEnvironment()
    await createHoardApp(environment)
    environment.receivePrinterState('standby')
    expect(environment.documentTitle).toBe('Hoard')
  })
})

describe('printer app cleanup', () => {
  it('stops listening to the stream and the route when removed', async () => {
    const environment = new FakeEnvironment()
    const element = await createHoardApp(environment)
    element.remove()
    expect(environment.isStreamUnsubscribed).toBe(true)
    expect(environment.isRouteUnsubscribed).toBe(true)
  })
})
