import type { Temps } from './types'

export interface RemainingInput {
  /** the slicer's estimate for the whole print, when the file has one */
  estimatedSeconds: number | null
  spentSeconds: number
  /** percent, 0 to 100 */
  progress: number
}

const SECONDS_PER_HOUR = 3600
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1000
const MILLIMETERS_PER_METER = 1000
const AT_TARGET_TOLERANCE_DEGREES = 2
const NO_VALUE = '—'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function splitDuration(seconds: number): { hours: number; minutes: number; seconds: number } {
  return {
    hours: Math.floor(seconds / SECONDS_PER_HOUR),
    minutes: Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    seconds: Math.floor(seconds % SECONDS_PER_MINUTE),
  }
}

export function formatSpentDuration(totalSeconds: number): string {
  const { hours, minutes, seconds } = splitDuration(totalSeconds)
  if (hours > 0) return `${hours}h ${pad(minutes)}m`
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`
  return `${seconds}s`
}

export function formatClockDuration(totalSeconds: number): string {
  const { hours, minutes, seconds } = splitDuration(totalSeconds)
  return `${hours}:${pad(minutes)}:${pad(seconds)}`
}

export function formatFilamentMeters(millimeters: number): string {
  return (millimeters / MILLIMETERS_PER_METER).toFixed(2)
}

export function calculateRemainingSeconds(input: RemainingInput): number | null {
  if (input.estimatedSeconds !== null) return Math.max(0, input.estimatedSeconds - input.spentSeconds)
  if (input.progress <= 0) return null
  return Math.round(input.spentSeconds / (input.progress / 100) - input.spentSeconds)
}

export function formatFinishTime(nowMilliseconds: number, remainingSeconds: number | null, timeZone?: string): string {
  if (remainingSeconds === null) return NO_VALUE
  const finish = new Date(nowMilliseconds + remainingSeconds * MILLISECONDS_PER_SECOND)
  return finish.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })
}

function isHeating(actual: number, target: number): boolean {
  return target > 0 && actual < target - AT_TARGET_TOLERANCE_DEGREES
}

export function describeTemperatureStatus(temperatures: Temps): string {
  const isOff = temperatures.hotend_target === 0 && temperatures.bed_target === 0
  if (isOff) return 'actual / target · heaters off'
  const isWarming =
    isHeating(temperatures.hotend_actual, temperatures.hotend_target) ||
    isHeating(temperatures.bed_actual, temperatures.bed_target)
  return isWarming ? 'actual / target · heating' : 'actual / target · both at target'
}
