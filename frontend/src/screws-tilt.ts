import type { ConsoleLine } from './types'

export interface ScrewAdvice {
  name: string
  /** the screw the others are measured against */
  isBase: boolean
  direction: 'CW' | 'CCW' | null
  /** how far to turn, as Klipper writes it: minutes of a clock face */
  turn: string | null
}

const SCREW_LINE = /^(?:\/\/ )?(.+?)( \(base\))? : x=-?[\d.]+, y=-?[\d.]+, z=-?[\d.]+(?: : adjust (CW|CCW) (\d+:\d+))?$/

function parseLine(message: string): ScrewAdvice | null {
  const found = SCREW_LINE.exec(message.trim())
  if (!found) return null
  const [, name, base, direction, turn] = found
  return {
    name,
    isBase: base !== undefined,
    direction: (direction as ScrewAdvice['direction']) ?? null,
    turn: turn ?? null,
  }
}

/** The screws of the newest screws tilt adjust in the console lines, the base screw first. */
export function parseScrewsTilt(lines: ConsoleLine[]): ScrewAdvice[] {
  const parsed = lines.map((line) => parseLine(line.message))
  const start = parsed.map((screw) => screw?.isBase === true).lastIndexOf(true)
  if (start < 0) return []
  const result: ScrewAdvice[] = []
  for (const screw of parsed.slice(start)) {
    if (!screw) break
    result.push(screw)
  }
  return result
}
