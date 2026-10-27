import { describe, expect, it } from 'vitest'
import { deriveAccent } from './theme'

const DARK = '#1a1a1d'
const WHITE = '#ffffff'

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('deriveAccent', () => {
  it('returns the normalized accent', () => {
    expect(deriveAccent('F45BCB')?.accent).toBe('#f45bcb')
  })

  it.each([
    ['#f45bcb', 'pink'],
    ['#fa6831', 'orange'],
    ['#b6f23b', 'lime'],
    ['#ffd54f', 'yellow'],
  ])('uses dark text on %s (%s)', (hex) => {
    expect(deriveAccent(hex)?.onAccent).toBe(DARK)
  })

  it.each([
    ['#1d3a8a', 'deep blue'],
    ['#6d28d9', 'violet'],
    ['#b91c1c', 'dark red'],
  ])('uses white text on %s (%s)', (hex) => {
    expect(deriveAccent(hex)?.onAccent).toBe(WHITE)
  })

  it('always picks the text color with the higher contrast, at least 4.5:1, for any accent', () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const hex = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
          const d = deriveAccent(hex)
          expect(d).not.toBeNull()
          const chosen = contrast(hex, d!.onAccent)
          const other = contrast(hex, d!.onAccent === DARK ? WHITE : DARK)
          expect(chosen).toBeGreaterThanOrEqual(other)
          expect(chosen).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('mixes 18% of the accent into the panel color for the tint', () => {
    // panel is rgb(43, 43, 47); pink is rgb(244, 91, 203)
    expect(deriveAccent('#f45bcb')?.tint).toBe('rgb(79, 52, 75)')
  })

  it('leaves the tint at the panel color for an accent equal to the panel', () => {
    expect(deriveAccent('#2b2b2f')?.tint).toBe('rgb(43, 43, 47)')
  })

  it('returns null for input that is not a hex color', () => {
    expect(deriveAccent('nope')).toBeNull()
    expect(deriveAccent('')).toBeNull()
  })
})
