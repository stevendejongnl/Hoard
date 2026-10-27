import { describe, expect, it } from 'vitest'
import { ACCENT_COLOR_STORAGE_KEY, createAccentTheme, isValidAccentColor } from './accent-theme'
import { DEFAULT_ACCENT_COLOR } from './theme'

class InMemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

class UnavailableStorage {
  getItem(): string | null {
    throw new Error('storage is blocked')
  }

  setItem(): void {
    throw new Error('storage is blocked')
  }

  removeItem(): void {
    throw new Error('storage is blocked')
  }
}

function createTheme(storage = new InMemoryStorage()) {
  const rootElement = document.createElement('div')
  const theme = createAccentTheme({ storage, rootElement })
  return { theme, storage, rootElement }
}

describe('isValidAccentColor', () => {
  it.each(['#f45bcb', 'F45BCB', '#f0c'])('accepts %s', (text) => {
    expect(isValidAccentColor(text)).toBe(true)
  })

  it.each(['', 'nope', '#12'])('rejects %j', (text) => {
    expect(isValidAccentColor(text)).toBe(false)
  })
})

describe('readAccentColor', () => {
  it('returns the default accent when nothing is stored', () => {
    expect(createTheme().theme.readAccentColor()).toBe(DEFAULT_ACCENT_COLOR)
  })

  it('returns the stored accent', () => {
    const { theme, storage } = createTheme()
    storage.setItem(ACCENT_COLOR_STORAGE_KEY, '#00a3ff')
    expect(theme.readAccentColor()).toBe('#00a3ff')
  })

  it('returns the default accent when the stored text is not a color', () => {
    const { theme, storage } = createTheme()
    storage.setItem(ACCENT_COLOR_STORAGE_KEY, 'garbage')
    expect(theme.readAccentColor()).toBe(DEFAULT_ACCENT_COLOR)
  })

  it('returns the default accent when the storage is blocked', () => {
    expect(createTheme(new UnavailableStorage()).theme.readAccentColor()).toBe(DEFAULT_ACCENT_COLOR)
  })
})

describe('applyAccentColor', () => {
  it('sets the accent, the text color on it and the selection tint on the root element', () => {
    const { theme, rootElement } = createTheme()
    theme.applyAccentColor('#00a3ff')
    expect(rootElement.style.getPropertyValue('--accent')).toBe('#00a3ff')
    expect(rootElement.style.getPropertyValue('--text-on-accent')).toBe('#1a1a1d')
    // panel rgb(43, 43, 47) moved 18% towards rgb(0, 163, 255)
    expect(rootElement.style.getPropertyValue('--selection-tint')).toBe('rgb(35, 65, 84)')
  })

  it('uses white text on a dark accent', () => {
    const { theme, rootElement } = createTheme()
    theme.applyAccentColor('#1d3a8a')
    expect(rootElement.style.getPropertyValue('--text-on-accent')).toBe('#ffffff')
  })

  it('leaves the root element alone for text that is not a color', () => {
    const { theme, rootElement } = createTheme()
    theme.applyAccentColor('nope')
    expect(rootElement.style.getPropertyValue('--accent')).toBe('')
  })
})

describe('storeAccentColor', () => {
  it('stores the normalized accent', () => {
    const { theme, storage } = createTheme()
    theme.storeAccentColor('00A3FF')
    expect(storage.getItem(ACCENT_COLOR_STORAGE_KEY)).toBe('#00a3ff')
  })

  it('removes the stored value when the accent is the default', () => {
    const { theme, storage } = createTheme()
    theme.storeAccentColor('#00a3ff')
    theme.storeAccentColor(DEFAULT_ACCENT_COLOR)
    expect(storage.getItem(ACCENT_COLOR_STORAGE_KEY)).toBeNull()
  })

  it('stores nothing for text that is not a color', () => {
    const { theme, storage } = createTheme()
    theme.storeAccentColor('nope')
    expect(storage.getItem(ACCENT_COLOR_STORAGE_KEY)).toBeNull()
  })

  it('does not throw when the storage is blocked', () => {
    const { theme } = createTheme(new UnavailableStorage())
    expect(() => theme.storeAccentColor('#00a3ff')).not.toThrow()
  })
})

describe('restoreAccentColor', () => {
  it('applies the stored accent', () => {
    const { theme, storage, rootElement } = createTheme()
    storage.setItem(ACCENT_COLOR_STORAGE_KEY, '#00a3ff')
    theme.restoreAccentColor()
    expect(rootElement.style.getPropertyValue('--accent')).toBe('#00a3ff')
  })

  it('applies the default accent when nothing is stored', () => {
    const { theme, rootElement } = createTheme()
    theme.restoreAccentColor()
    expect(rootElement.style.getPropertyValue('--accent')).toBe(DEFAULT_ACCENT_COLOR)
  })
})
