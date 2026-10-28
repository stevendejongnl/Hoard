import type { PrinterState } from './types'

const APP_NAME = 'Hoard'
const ICON_BY_ACTIVE_STATE: Record<string, string> = { printing: '🖨', paused: '⏸' }

type ClockTimeFormatter = (date: Date) => string

function describeProgress(printerState: PrinterState): string {
  return printerState.progress > 0 ? `${printerState.progress}%` : ''
}

/** The print has run for `time_remaining` seconds (the name is the stream's), so the rest follows from the progress. */
function describeFinish(printerState: PrinterState, now: Date, formatClockTime: ClockTimeFormatter): string {
  const elapsedSeconds = printerState.time_remaining
  if (elapsedSeconds <= 0 || printerState.progress <= 0) return ''
  const totalSeconds = elapsedSeconds / (printerState.progress / 100)
  const remainingSeconds = totalSeconds - elapsedSeconds
  const finish = new Date(now.getTime() + remainingSeconds * 1000)
  return `→ ${formatClockTime(finish)}`
}

/** The browser tab title: the app name when idle, progress and finish time while a print is active. */
export function buildDocumentTitle(
  printerState: PrinterState | null,
  now: Date,
  formatClockTime: ClockTimeFormatter,
): string {
  if (!printerState) return APP_NAME
  const icon = ICON_BY_ACTIVE_STATE[printerState.state]
  if (!icon) return APP_NAME
  const parts = [icon, describeProgress(printerState), describeFinish(printerState, now, formatClockTime)]
  return parts.filter(Boolean).join(' ')
}
