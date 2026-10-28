import { createServerSentEventsClient } from './server-sent-events-client'
import type { ServerSentEventPayload } from './server-sent-events-client'

// Kept so existing imports keep working; the client itself lives in server-sent-events-client.ts.
export type SSEPayload = ServerSentEventPayload

export const sseClient = createServerSentEventsClient()
