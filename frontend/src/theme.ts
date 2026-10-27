export const DEFAULT_ACCENT = '#f45bcb'

/** Normalize user input to lowercase `#rrggbb`, or null when it is not a 3/6-digit hex color. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().replace(/^#?/, '#').toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('')
  return null
}
