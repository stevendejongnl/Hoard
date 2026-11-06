/** Starts a timer and gives back what cancels it */
export type StartTimer = (callback: () => void, milliseconds: number) => () => void

export const startBrowserTimer: StartTimer = (callback, milliseconds) => {
  const handle = window.setTimeout(callback, milliseconds)
  return () => window.clearTimeout(handle)
}

/** A press that counts only when it lasts the whole time, so a stray tap does nothing. */
export class HoldGesture {
  private readonly startTimer: StartTimer
  private readonly milliseconds: number
  private readonly onComplete: () => void
  private cancelTimer: (() => void) | null = null

  constructor(startTimer: StartTimer, milliseconds: number, onComplete: () => void) {
    this.startTimer = startTimer
    this.milliseconds = milliseconds
    this.onComplete = onComplete
  }

  get isHolding(): boolean {
    return this.cancelTimer !== null
  }

  press(): void {
    if (this.cancelTimer) return
    this.cancelTimer = this.startTimer(() => this.complete(), this.milliseconds)
  }

  release(): void {
    this.cancelTimer?.()
    this.cancelTimer = null
  }

  private complete(): void {
    this.cancelTimer = null
    this.onComplete()
  }
}
