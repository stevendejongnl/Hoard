import type { PiStats, Power, PrinterState, Temps } from './types'

export type SSEPayload =
  | { type: 'printer_state'; data: PrinterState }
  | { type: 'temps'; data: Temps }
  | { type: 'power'; data: Power }
  | { type: 'pi_stats'; data: PiStats }
  | { type: 'history_updated'; data: { job_id: string; filename: string } }

type Handler = (payload: SSEPayload) => void

class SSEClient {
  private es: EventSource | null = null
  private handlers: Handler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect(): void {
    if (this.es) return
    this.es = new EventSource('/stream')

    const types: SSEPayload['type'][] = ['printer_state', 'temps', 'power', 'pi_stats', 'history_updated']
    for (const type of types) {
      this.es.addEventListener(type, (e: Event) => {
        const me = e as MessageEvent
        try {
          const data = JSON.parse(me.data as string)
          this.handlers.forEach(h => h({ type, data } as SSEPayload))
        } catch {
          // ignore malformed
        }
      })
    }

    this.es.onerror = () => {
      this.es?.close()
      this.es = null
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.es?.close()
    this.es = null
  }

  subscribe(handler: Handler): () => void {
    this.handlers.push(handler)
    return () => { this.handlers = this.handlers.filter(h => h !== handler) }
  }
}

export const sseClient = new SSEClient()
