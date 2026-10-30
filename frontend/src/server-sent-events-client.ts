import type { PiStats, Power, PrinterState, Temps } from './types'

export type ServerSentEventPayload =
  | { type: 'printer_state'; data: PrinterState }
  | { type: 'temps'; data: Temps }
  | { type: 'power'; data: Power }
  | { type: 'pi_stats'; data: PiStats }
  | { type: 'history_updated'; data: { job_id: string; filename: string } }
  | { type: 'system_faults'; data: { active_count: number } }

export interface ConnectionStatus {
  isConnected: boolean
  /** milliseconds since the epoch of the last message, 0 when none has arrived */
  lastMessageAt: number
}

/** The part of `EventSource` the client needs, so tests can pass a fake. */
export interface EventSourceLike {
  onopen: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  addEventListener(name: string, listener: (event: MessageEvent) => void): void
  close(): void
}

export interface ServerSentEventsDependencies {
  createEventSource: (url: string) => EventSourceLike
  scheduleTimer: (callback: () => void, delayMilliseconds: number) => unknown
  cancelTimer: (timer: unknown) => void
  now: () => number
}

type PayloadHandler = (payload: ServerSentEventPayload) => void
type StatusHandler = (status: ConnectionStatus) => void

const STREAM_URL = '/stream'
const RECONNECT_DELAY_MILLISECONDS = 3000
const EVENT_NAMES: ServerSentEventPayload['type'][] = [
  'printer_state',
  'temps',
  'power',
  'pi_stats',
  'history_updated',
  'system_faults',
]

/** Returns the parsed value, or undefined when the text is not valid JSON. */
function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export class ServerSentEventsClient {
  private eventSource: EventSourceLike | null = null
  private reconnectTimer: unknown = null
  private payloadHandlers: PayloadHandler[] = []
  private statusHandlers: StatusHandler[] = []
  private currentStatus: ConnectionStatus = { isConnected: false, lastMessageAt: 0 }

  constructor(private readonly dependencies: ServerSentEventsDependencies) {}

  get status(): ConnectionStatus {
    return this.currentStatus
  }

  connect(): void {
    if (this.eventSource) return
    const eventSource = this.dependencies.createEventSource(STREAM_URL)
    eventSource.onopen = () => this.updateStatus({ isConnected: true })
    eventSource.onerror = () => this.handleFailure()
    EVENT_NAMES.forEach((name) => this.listenTo(eventSource, name))
    this.eventSource = eventSource
  }

  disconnect(): void {
    this.cancelReconnect()
    this.closeEventSource()
    this.updateStatus({ isConnected: false })
  }

  subscribe(handler: PayloadHandler): () => void {
    this.payloadHandlers.push(handler)
    return () => {
      this.payloadHandlers = this.payloadHandlers.filter((existing) => existing !== handler)
    }
  }

  /** Tells the handler the current status right away, then every change. */
  subscribeToStatus(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler)
    handler(this.currentStatus)
    return () => {
      this.statusHandlers = this.statusHandlers.filter((existing) => existing !== handler)
    }
  }

  private listenTo(eventSource: EventSourceLike, name: ServerSentEventPayload['type']): void {
    eventSource.addEventListener(name, (event) => this.handleMessage(name, event.data as string))
  }

  private handleMessage(name: ServerSentEventPayload['type'], text: string): void {
    const data = parseJsonText(text)
    if (data === undefined) return
    this.updateStatus({ isConnected: true, lastMessageAt: this.dependencies.now() })
    this.payloadHandlers.forEach((handler) => handler({ type: name, data } as ServerSentEventPayload))
  }

  private handleFailure(): void {
    this.closeEventSource()
    this.updateStatus({ isConnected: false })
    this.reconnectTimer = this.dependencies.scheduleTimer(() => this.connect(), RECONNECT_DELAY_MILLISECONDS)
  }

  private closeEventSource(): void {
    this.eventSource?.close()
    this.eventSource = null
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer === null) return
    this.dependencies.cancelTimer(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private updateStatus(change: Partial<ConnectionStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...change }
    this.statusHandlers.forEach((handler) => handler(this.currentStatus))
  }
}

export function createServerSentEventsClient(): ServerSentEventsClient {
  return new ServerSentEventsClient({
    createEventSource: (url) => new EventSource(url),
    scheduleTimer: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
    cancelTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  })
}
