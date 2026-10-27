import { describe, expect, it } from 'vitest'
import { normalizeHexadecimalColor } from './theme'

describe('normalizeHexadecimalColor', () => {
  it('lowercases and keeps a valid six digit color', () => {
    expect(normalizeHexadecimalColor('#F45BCB')).toBe('#f45bcb')
  })

  it('adds the missing number sign', () => {
    expect(normalizeHexadecimalColor('f45bcb')).toBe('#f45bcb')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeHexadecimalColor('  #f45bcb ')).toBe('#f45bcb')
  })

  it('expands three digit shorthand', () => {
    expect(normalizeHexadecimalColor('#f0c')).toBe('#ff00cc')
  })

  it.each(['', '#', '#12', '#12345', 'zzzzzz', '#gggggg', '#f45bcbff', 'not a color'])('rejects %j', (input) => {
    expect(normalizeHexadecimalColor(input)).toBeNull()
  })
})
