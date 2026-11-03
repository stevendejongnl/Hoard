import type { DetectionSettings, DetectionState } from './types'

export type StateTone = 'ok' | 'muted' | 'warning' | 'error'

const STATE_TEXT: Record<DetectionState, string> = {
  off: 'Off',
  idle: 'Idle',
  watching: 'Watching',
  unavailable: 'Detector unavailable',
  alert: 'Looks failed',
}

const STATE_TONE: Record<DetectionState, StateTone> = {
  off: 'muted',
  idle: 'muted',
  watching: 'ok',
  unavailable: 'warning',
  alert: 'error',
}

const PERCENT = 100

export const describeDetectionState = (state: DetectionState): string => STATE_TEXT[state]

export const findStateTone = (state: DetectionState): StateTone => STATE_TONE[state]

export function formatPercent(score: number | null): string {
  return score === null ? '–' : `${Math.round(score * PERCENT)}%`
}

export const describeFrameRule = (settings: DetectionSettings): string =>
  `${settings.required_frames} of ${settings.window_size} frames`

export function describeAlertTime(seconds: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(seconds * 1000))
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? ''
  return `${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`
}

export interface CornerBox {
  x: number
  y: number
  width: number
  height: number
}

/** The detector gives the centre of a box; a drawing needs its top left corner. */
export function toTopLeftBox([centerX, centerY, width, height]: number[]): CornerBox {
  return { x: centerX - width / 2, y: centerY - height / 2, width, height }
}
