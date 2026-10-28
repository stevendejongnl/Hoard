import { describe, expect, it } from 'vitest'
import { ServerSentEventsClient } from './server-sent-events-client'
import type { ConnectionStatus } from './server-sent-events-client'

const RECONNECT_DELAY_MILLISECONDS = 3000

class FakeEventSource {
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  isClosed = false
  private listeners = new Map<string, (event: MessageEvent) => void>()

  constructor(readonly url: string) {}

  addEventListener(name: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(name, listener)
  }

  close(): void {
    this.isClosed = true
  }

  open(): void {
    this.onopen?.()
  }

  fail(): void {
    this.onerror?.()
  }

  receive(name: string, text: string): void {
    this.listeners.get(name)?.({ data: text } as MessageEvent)
  }
}

class FakeTimers {
  scheduled: Array<{ callback: () => void; delayMilliseconds: number; isCancelled: boolean }> = []

  schedule = (callback: () => void, delayMilliseconds: number) => {
    const timer = { callback, delayMilliseconds, isCancelled: false }
    this.scheduled.push(timer)
    return timer
  }

  cancel = (timer: unknown) => {
    ;(timer as { isCancelled: boolean }).isCancelled = true
  }

  runLast(): void {
    this.scheduled[this.scheduled.length - 1].callback()
  }
}

function createClient() {
  const eventSources: FakeEventSource[] = []
  const timers = new FakeTimers()
  let currentTime = 1000
  const client = new ServerSentEventsClient({
    createEventSource: (url) => {
      const eventSource = new FakeEventSource(url)
      eventSources.push(eventSource)
      return eventSource
    },
    scheduleTimer: timers.schedule,
    cancelTimer: timers.cancel,
    now: () => currentTime,
  })
  return { client, eventSources, timers, advanceTimeTo: (time: number) => (currentTime = time) }
}

describe('ServerSentEventsClient status', () => {
  it('starts disconnected without any message', () => {
    expect(createClient().client.status).toEqual({ isConnected: false, lastMessageAt: 0 })
  })

  it('connects to the stream once, even when connect is called twice', () => {
    const { client, eventSources } = createClient()
    client.connect()
    client.connect()
    expect(eventSources).toHaveLength(1)
    expect(eventSources[0].url).toBe('/stream')
  })

  it('becomes connected when the stream opens', () => {
    const { client, eventSources } = createClient()
    client.connect()
    eventSources[0].open()
    expect(client.status.isConnected).toBe(true)
  })

  it('records the time of the last message and stays connected', () => {
    const { client, eventSources, advanceTimeTo } = createClient()
    client.connect()
    advanceTimeTo(5000)
    eventSources[0].receive('temps', JSON.stringify({ hotend_actual: 204.9 }))
    expect(client.status).toEqual({ isConnected: true, lastMessageAt: 5000 })
  })

  it('becomes disconnected, closes the stream and schedules a reconnect when the stream fails', () => {
    const { client, eventSources, timers } = createClient()
    client.connect()
    eventSources[0].open()
    eventSources[0].fail()
    expect(client.status.isConnected).toBe(false)
    expect(eventSources[0].isClosed).toBe(true)
    expect(timers.scheduled[0].delayMilliseconds).toBe(RECONNECT_DELAY_MILLISECONDS)
  })

  it('opens a new stream when the scheduled reconnect runs', () => {
    const { client, eventSources, timers } = createClient()
    client.connect()
    eventSources[0].fail()
    timers.runLast()
    expect(eventSources).toHaveLength(2)
  })

  it('stops, closes the stream and cancels a pending reconnect when disconnected on purpose', () => {
    const { client, eventSources, timers } = createClient()
    client.connect()
    eventSources[0].fail()
    client.disconnect()
    expect(timers.scheduled[0].isCancelled).toBe(true)
    expect(client.status.isConnected).toBe(false)
  })
})

describe('ServerSentEventsClient subscriptions', () => {
  it('passes parsed events to subscribers by type', () => {
    const { client, eventSources } = createClient()
    const received: unknown[] = []
    client.subscribe((payload) => received.push(payload))
    client.connect()
    eventSources[0].receive('power', JSON.stringify({ watts: 109 }))
    expect(received).toEqual([{ type: 'power', data: { watts: 109 } }])
  })

  it('ignores a message that is not valid JSON', () => {
    const { client, eventSources } = createClient()
    const received: unknown[] = []
    client.subscribe((payload) => received.push(payload))
    client.connect()
    eventSources[0].receive('power', 'not json')
    expect(received).toEqual([])
    expect(client.status.lastMessageAt).toBe(0)
  })

  it('stops passing events after unsubscribing', () => {
    const { client, eventSources } = createClient()
    const received: unknown[] = []
    const unsubscribe = client.subscribe((payload) => received.push(payload))
    client.connect()
    unsubscribe()
    eventSources[0].receive('power', JSON.stringify({ watts: 109 }))
    expect(received).toEqual([])
  })

  it('tells a new status subscriber the current status immediately', () => {
    const { client } = createClient()
    const statuses: ConnectionStatus[] = []
    client.subscribeToStatus((status) => statuses.push(status))
    expect(statuses).toEqual([{ isConnected: false, lastMessageAt: 0 }])
  })

  it('tells status subscribers about every change until they unsubscribe', () => {
    const { client, eventSources } = createClient()
    const statuses: ConnectionStatus[] = []
    const unsubscribe = client.subscribeToStatus((status) => statuses.push(status))
    client.connect()
    eventSources[0].open()
    unsubscribe()
    eventSources[0].fail()
    expect(statuses.map((status) => status.isConnected)).toEqual([false, true])
  })
})
