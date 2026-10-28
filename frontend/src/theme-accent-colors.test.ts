import { describe, expect, it } from 'vitest'
import { deriveAccentColors } from './theme'

const DARK_TEXT_COLOR = '#1a1a1d'
const LIGHT_TEXT_COLOR = '#ffffff'

function linearizeChannel(channelValue: number): number {
  const fraction = channelValue / 255
  if (fraction <= 0.03928) return fraction / 12.92
  return Math.pow((fraction + 0.055) / 1.055, 2.4)
}

function luminanceOf(hexadecimalColor: string): number {
  const number = parseInt(hexadecimalColor.slice(1), 16)
  const red = linearizeChannel((number >> 16) & 255)
  const green = linearizeChannel((number >> 8) & 255)
  const blue = linearizeChannel(number & 255)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatioBetween(firstColor: string, secondColor: string): number {
  const luminances = [luminanceOf(firstColor), luminanceOf(secondColor)].sort((first, second) => second - first)
  return (luminances[0] + 0.05) / (luminances[1] + 0.05)
}

function everySampleColor(): string[] {
  const steps = [0, 51, 102, 153, 204, 255]
  const channels = steps.flatMap((red) => steps.flatMap((green) => steps.map((blue) => [red, green, blue])))
  return channels.map((triple) => '#' + triple.map((value) => value.toString(16).padStart(2, '0')).join(''))
}

describe('deriveAccentColors', () => {
  it('returns the normalized accent color', () => {
    expect(deriveAccentColors('F45BCB')?.accentColor).toBe('#f45bcb')
  })

  it.each([
    ['#f45bcb', 'pink'],
    ['#fa6831', 'orange'],
    ['#b6f23b', 'lime'],
    ['#ffd54f', 'yellow'],
  ])('puts dark text on %s (%s)', (color) => {
    expect(deriveAccentColors(color)?.textColorOnAccent).toBe(DARK_TEXT_COLOR)
  })

  it.each([
    ['#1d3a8a', 'deep blue'],
    ['#6d28d9', 'violet'],
    ['#b91c1c', 'dark red'],
  ])('puts white text on %s (%s)', (color) => {
    expect(deriveAccentColors(color)?.textColorOnAccent).toBe(LIGHT_TEXT_COLOR)
  })

  // With only dark #1a1a1d and white to choose from, mid-tone accents cross over at about 4.17:1.
  // That is the guaranteed floor for an arbitrary accent; 4.5:1 is not reachable for every color.
  it.each(everySampleColor())('picks the more readable text color, at least 4.1:1, on %s', (color) => {
    const textColor = deriveAccentColors(color)?.textColorOnAccent as string
    const otherTextColor = textColor === DARK_TEXT_COLOR ? LIGHT_TEXT_COLOR : DARK_TEXT_COLOR
    expect(contrastRatioBetween(color, textColor)).toBeGreaterThanOrEqual(contrastRatioBetween(color, otherTextColor))
    expect(contrastRatioBetween(color, textColor)).toBeGreaterThanOrEqual(4.1)
  })

  it.each(['#f45bcb', '#fa6831', '#00a3ff', '#b6f23b'])('reaches 4.5:1 on the preset accent %s', (color) => {
    const textColor = deriveAccentColors(color)?.textColorOnAccent as string
    expect(contrastRatioBetween(color, textColor)).toBeGreaterThanOrEqual(4.5)
  })

  it('mixes 18 percent of the accent into the panel color for the selection tint', () => {
    // the panel color is rgb(43, 43, 47) and pink is rgb(244, 91, 203)
    expect(deriveAccentColors('#f45bcb')?.selectionTintColor).toBe('rgb(79, 52, 75)')
  })

  it('keeps the selection tint at the panel color when the accent equals the panel color', () => {
    expect(deriveAccentColors('#2b2b2f')?.selectionTintColor).toBe('rgb(43, 43, 47)')
  })

  it('returns null for text that is not a hexadecimal color', () => {
    expect(deriveAccentColors('nope')).toBeNull()
    expect(deriveAccentColors('')).toBeNull()
  })
})
