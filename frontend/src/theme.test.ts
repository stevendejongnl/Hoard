import { describe, expect, it } from 'vitest'
import { normalizeHex } from './theme'

describe('normalizeHex', () => {
  it('lowercases and keeps a valid 6-digit hex', () => {
    expect(normalizeHex('#F45BCB')).toBe('#f45bcb')
  })

  it('adds the missing # prefix', () => {
    expect(normalizeHex('f45bcb')).toBe('#f45bcb')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeHex('  #f45bcb ')).toBe('#f45bcb')
  })

  it('expands 3-digit shorthand', () => {
    expect(normalizeHex('#f0c')).toBe('#ff00cc')
  })

  it.each(['', '#', '#12', '#12345', 'zzzzzz', '#gggggg', '#f45bcbff', 'not a color'])('rejects %j', (input) => {
    expect(normalizeHex(input)).toBeNull()
  })
})
