import type { ConsoleLine } from './types'

/** A report the printer sends by itself while it heats: `B:53.5 /60.0 T0:20.6 /0.0`. */
const TEMPERATURE_REPORT = /^(?:ok\s+)?(?:(?:B|T\d*|@\w*):\s*-?[\d.]+(?:\s*\/\s*-?[\d.]+)?\s*)+$/

export type ConsoleLineKind = 'command' | 'error' | 'note' | 'response'

export interface ConsoleFilter {
  query: string
  hideTemperatures: boolean
  /** lines up to this time (seconds since 1970) were cleared from the view */
  clearedUntil: number
}

export function isTemperatureReport(message: string): boolean {
  return TEMPERATURE_REPORT.test(message.trim())
}

/** What a line is: a command the person sent, an error (`!!`), a note of Klipper (`//`), or a plain answer. */
export function describeConsoleLine(line: ConsoleLine): ConsoleLineKind {
  if (line.type === 'command') return 'command'
  if (line.message.startsWith('!!')) return 'error'
  return line.message.startsWith('//') ? 'note' : 'response'
}

export function filterConsoleLines(lines: ConsoleLine[], filter: ConsoleFilter): ConsoleLine[] {
  const query = filter.query.trim().toLowerCase()
  return lines.filter(
    (line) =>
      line.time > filter.clearedUntil &&
      !(filter.hideTemperatures && isTemperatureReport(line.message)) &&
      (!query || line.message.toLowerCase().includes(query)),
  )
}

export function formatConsoleTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString('en-GB', { hour12: false })
}

/** The line as it is copied: the time, then the command with a `$`, or the answer. */
export function formatConsoleLine(line: ConsoleLine): string {
  return `${formatConsoleTime(line.time)} ${line.type === 'command' ? '$ ' : ''}${line.message}`
}
