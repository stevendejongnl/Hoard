import { afterEach, describe, expect, it } from 'vitest'
import './status-bar'
import type { StatusBar } from './status-bar'
import type { ConnectionStatus } from '../server-sent-events-client'

const NEVER_CONNECTED: ConnectionStatus = { isConnected: false, lastMessageAt: 0 }

class FakeEnvironment {
  currentTime = 100_000
  status: ConnectionStatus = NEVER_CONNECTED
  version = 'dev'
  private statusHandler: ((status: ConnectionStatus) => void) | null = null
  private tick: (() => void) | null = null
  isUnsubscribed = false
  isTickerStopped = false

  subscribeToConnectionStatus = (handler: (status: ConnectionStatus) => void) => {
    this.statusHandler = handler
    handler(this.status)
    return () => {
      this.isUnsubscribed = true
    }
  }

  repeatEverySecond = (callback: () => void) => {
    this.tick = callback
    return () => {
      this.isTickerStopped = true
    }
  }

  loadVersion = async () => this.version

  changeStatus(status: ConnectionStatus): void {
    this.status = status
    this.statusHandler?.(status)
  }

  advanceSeconds(seconds: number): void {
    this.currentTime += seconds * 1000
    this.tick?.()
  }
}

async function createStatusBar(environment: FakeEnvironment, printerState = 'printing'): Promise<StatusBar> {
  const element = document.createElement('status-bar') as StatusBar
  element.printerState = printerState
  element.subscribeToConnectionStatus = environment.subscribeToConnectionStatus
  element.repeatEverySecond = environment.repeatEverySecond
  element.now = () => environment.currentTime
  element.loadVersion = environment.loadVersion
  document.body.appendChild(element)
  await element.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await element.updateComplete
  return element
}

function readText(element: StatusBar): string {
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('status bar connection', () => {
  it('says disconnected before the stream has connected', async () => {
    expect(readText(await createStatusBar(new FakeEnvironment()))).toContain('Disconnected')
  })

  it('says connected once the stream is connected', async () => {
    const environment = new FakeEnvironment()
    const element = await createStatusBar(environment)
    environment.changeStatus({ isConnected: true, lastMessageAt: environment.currentTime })
    await element.updateComplete
    expect(readText(element)).toContain('Connected')
    expect(readText(element)).not.toContain('Disconnected')
  })

  it('shows a green light while connected and a red one while disconnected', async () => {
    const environment = new FakeEnvironment()
    const element = await createStatusBar(environment)
    expect(element.querySelector('.connection-light.disconnected')).not.toBeNull()
    environment.changeStatus({ isConnected: true, lastMessageAt: environment.currentTime })
    await element.updateComplete
    expect(element.querySelector('.connection-light.disconnected')).toBeNull()
  })
})

describe('status bar Klipper state', () => {
  it.each([
    ['printing', 'Klipper ready'],
    ['standby', 'Klipper ready'],
    ['paused', 'Klipper ready'],
    ['error', 'Klipper error'],
    ['', 'Klipper state unknown'],
  ])('shows %j as %s', async (printerState, text) => {
    expect(readText(await createStatusBar(new FakeEnvironment(), printerState))).toContain(text)
  })
})

describe('status bar freshness', () => {
  it('waits for data when no message has arrived', async () => {
    expect(readText(await createStatusBar(new FakeEnvironment()))).toContain('Waiting for data')
  })

  it('says just now for a message under two seconds old', async () => {
    const environment = new FakeEnvironment()
    environment.status = { isConnected: true, lastMessageAt: environment.currentTime - 1000 }
    expect(readText(await createStatusBar(environment))).toContain('Updated just now')
  })

  it('counts the seconds since the last message', async () => {
    const environment = new FakeEnvironment()
    environment.status = { isConnected: true, lastMessageAt: environment.currentTime - 2000 }
    expect(readText(await createStatusBar(environment))).toContain('Updated 2 s ago')
  })

  it('keeps counting as time passes', async () => {
    const environment = new FakeEnvironment()
    environment.status = { isConnected: true, lastMessageAt: environment.currentTime }
    const element = await createStatusBar(environment)
    environment.advanceSeconds(5)
    await element.updateComplete
    expect(readText(element)).toContain('Updated 5 s ago')
  })
})

describe('status bar version', () => {
  it('shows the version the server reports', async () => {
    const environment = new FakeEnvironment()
    environment.version = '1.38.0'
    expect(readText(await createStatusBar(environment))).toContain('v1.38.0')
  })

  it('shows nothing for the version when it cannot be loaded', async () => {
    const environment = new FakeEnvironment()
    environment.loadVersion = async () => {
      throw new Error('offline')
    }
    expect(readText(await createStatusBar(environment))).not.toContain(' v')
  })
})

describe('status bar cleanup', () => {
  it('stops listening and ticking when it is removed', async () => {
    const environment = new FakeEnvironment()
    const element = await createStatusBar(environment)
    element.remove()
    expect(environment.isUnsubscribed).toBe(true)
    expect(environment.isTickerStopped).toBe(true)
  })
})
