import { DEFAULT_ACCENT_COLOR, deriveAccentColors, normalizeHexadecimalColor } from './theme'

export const ACCENT_COLOR_STORAGE_KEY = 'hoard.accent-color'

/** The part of `Storage` the accent theme needs, so tests can pass a fake. */
export interface AccentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface AccentThemeDependencies {
  storage: AccentStorage
  rootElement: HTMLElement
}

export function isValidAccentColor(text: string): boolean {
  return normalizeHexadecimalColor(text) !== null
}

function ignoreStorageErrors(action: () => void): void {
  try {
    action()
  } catch {
    // The storage is blocked (private browsing, for example): the accent still applies for this session.
  }
}

export class AccentTheme {
  private readonly storage: AccentStorage
  private readonly rootElement: HTMLElement

  constructor(dependencies: AccentThemeDependencies) {
    this.storage = dependencies.storage
    this.rootElement = dependencies.rootElement
  }

  private readStoredText(): string | null {
    try {
      return this.storage.getItem(ACCENT_COLOR_STORAGE_KEY)
    } catch {
      return null
    }
  }

  readAccentColor(): string {
    return normalizeHexadecimalColor(this.readStoredText() ?? '') ?? DEFAULT_ACCENT_COLOR
  }

  applyAccentColor(text: string): void {
    const colors = deriveAccentColors(text)
    if (!colors) return
    this.rootElement.style.setProperty('--accent', colors.accentColor)
    this.rootElement.style.setProperty('--text-on-accent', colors.textColorOnAccent)
    this.rootElement.style.setProperty('--selection-tint', colors.selectionTintColor)
  }

  storeAccentColor(text: string): void {
    const accentColor = normalizeHexadecimalColor(text)
    if (!accentColor) return
    if (accentColor === DEFAULT_ACCENT_COLOR) {
      ignoreStorageErrors(() => this.storage.removeItem(ACCENT_COLOR_STORAGE_KEY))
      return
    }
    ignoreStorageErrors(() => this.storage.setItem(ACCENT_COLOR_STORAGE_KEY, accentColor))
  }

  restoreAccentColor(): void {
    this.applyAccentColor(this.readAccentColor())
  }
}

export function createAccentTheme(dependencies: AccentThemeDependencies): AccentTheme {
  return new AccentTheme(dependencies)
}
