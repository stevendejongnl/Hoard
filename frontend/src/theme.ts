export const DEFAULT_ACCENT_COLOR = '#f45bcb'

const DARK_TEXT_COLOR = '#1a1a1d'
const LIGHT_TEXT_COLOR = '#ffffff'
const SELECTION_TINT_STRENGTH = 0.18

export interface RedGreenBlueColor {
  red: number
  green: number
  blue: number
}

export interface AccentColors {
  accentColor: string
  /** the readable text color to put on top of the accent */
  textColorOnAccent: string
  /** the accent mixed into the panel color, for selected rows */
  selectionTintColor: string
}

const PANEL_COLOR: RedGreenBlueColor = { red: 43, green: 43, blue: 47 }

function expandShorthandDigits(digits: string): string {
  return [...digits].map((digit) => digit + digit).join('')
}

/** Returns lowercase `#rrggbb`, or null when the text is not a three or six digit hexadecimal color. */
export function normalizeHexadecimalColor(text: string): string | null {
  const digits = text.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(digits)) return `#${digits}`
  if (/^[0-9a-f]{3}$/.test(digits)) return `#${expandShorthandDigits(digits)}`
  return null
}

function parseRedGreenBlue(normalizedColor: string): RedGreenBlueColor {
  const number = parseInt(normalizedColor.slice(1), 16)
  return { red: (number >> 16) & 255, green: (number >> 8) & 255, blue: number & 255 }
}

function linearizeChannel(channelValue: number): number {
  const fraction = channelValue / 255
  if (fraction <= 0.03928) return fraction / 12.92
  return Math.pow((fraction + 0.055) / 1.055, 2.4)
}

function calculateRelativeLuminance(color: RedGreenBlueColor): number {
  const redPart = 0.2126 * linearizeChannel(color.red)
  const greenPart = 0.7152 * linearizeChannel(color.green)
  const bluePart = 0.0722 * linearizeChannel(color.blue)
  return redPart + greenPart + bluePart
}

function calculateContrastRatio(firstColor: RedGreenBlueColor, secondColor: RedGreenBlueColor): number {
  const luminances = [calculateRelativeLuminance(firstColor), calculateRelativeLuminance(secondColor)]
  const lighterLuminance = Math.max(...luminances)
  const darkerLuminance = Math.min(...luminances)
  return (lighterLuminance + 0.05) / (darkerLuminance + 0.05)
}

function chooseTextColorOnAccent(accent: RedGreenBlueColor): string {
  const contrastWithDarkText = calculateContrastRatio(accent, parseRedGreenBlue(DARK_TEXT_COLOR))
  const contrastWithLightText = calculateContrastRatio(accent, parseRedGreenBlue(LIGHT_TEXT_COLOR))
  return contrastWithDarkText >= contrastWithLightText ? DARK_TEXT_COLOR : LIGHT_TEXT_COLOR
}

function mixChannelTowardsPanel(channelValue: number, panelChannelValue: number): number {
  return Math.round(panelChannelValue + (channelValue - panelChannelValue) * SELECTION_TINT_STRENGTH)
}

function mixTowardsPanelColor(color: RedGreenBlueColor): RedGreenBlueColor {
  return {
    red: mixChannelTowardsPanel(color.red, PANEL_COLOR.red),
    green: mixChannelTowardsPanel(color.green, PANEL_COLOR.green),
    blue: mixChannelTowardsPanel(color.blue, PANEL_COLOR.blue),
  }
}

function formatCssColor(color: RedGreenBlueColor): string {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`
}

/** Returns the accent, the text color to use on it and the selection tint, or null for an invalid color. */
export function deriveAccentColors(text: string): AccentColors | null {
  const accentColor = normalizeHexadecimalColor(text)
  if (!accentColor) return null
  const accent = parseRedGreenBlue(accentColor)
  return {
    accentColor,
    textColorOnAccent: chooseTextColorOnAccent(accent),
    selectionTintColor: formatCssColor(mixTowardsPanelColor(accent)),
  }
}
