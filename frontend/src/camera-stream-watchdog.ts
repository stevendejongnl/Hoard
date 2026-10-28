/** What a look at the picture of a camera stream gives: a signature that changes with the picture, and whether it is black. */
export interface FrameSample {
  signature: string
  isBlank: boolean
}

export interface StreamObservation {
  isStale: boolean
  shouldReconnect: boolean
  hasNewFrame: boolean
}

const DEFAULT_STALE_AFTER_MILLISECONDS = 2000
const DEFAULT_RECONNECT_AFTER_MILLISECONDS = 8000
const FIRST_RETRY_DELAY_MILLISECONDS = 1000
const LONGEST_RETRY_DELAY_MILLISECONDS = 10000

/** Decides from the samples of a stream whether it still delivers pictures, or has stalled and must be loaded again. */
export class StreamWatchdog {
  private lastSignature: string | null = null
  private lastNewFrameAt: number | null = null

  constructor(
    private readonly staleAfter = DEFAULT_STALE_AFTER_MILLISECONDS,
    private readonly reconnectAfter = DEFAULT_RECONNECT_AFTER_MILLISECONDS,
  ) {}

  /** A new connection starts here: it gets time to deliver a frame, and its first frame counts as new. */
  reset(now: number): void {
    this.lastSignature = null
    this.lastNewFrameAt = now
  }

  observe(sample: FrameSample | null, now: number): StreamObservation {
    const hasNewFrame = this.isNewFrame(sample)
    if (hasNewFrame) this.rememberFrame(sample, now)
    const silence = now - (this.lastNewFrameAt ??= now)
    return { isStale: silence >= this.staleAfter, shouldReconnect: silence >= this.reconnectAfter, hasNewFrame }
  }

  private isNewFrame(sample: FrameSample | null): sample is FrameSample {
    return sample !== null && !sample.isBlank && sample.signature !== this.lastSignature
  }

  private rememberFrame(sample: FrameSample, now: number): void {
    this.lastSignature = sample.signature
    this.lastNewFrameAt = now
  }
}

export function reconnectDelayMilliseconds(failureCount: number): number {
  return Math.min(FIRST_RETRY_DELAY_MILLISECONDS * 2 ** failureCount, LONGEST_RETRY_DELAY_MILLISECONDS)
}

export function withReconnectParameter(address: string, attempt: number): string {
  if (attempt === 0) return address
  const separator = address.includes('?') ? '&' : '?'
  return `${address}${separator}reconnect=${attempt}`
}
