import { afterEach, describe, expect, it } from 'vitest'
import './status-bar'
import type { StatusBar } from './status-bar'

class FakeAccentTheme {
  accentColor = '#f45bcb'
  applied: string[] = []
  stored: string[] = []

  readAccentColor(): string {
    return this.accentColor
  }

  applyAccentColor(text: string): void {
    this.applied.push(text)
  }

  storeAccentColor(text: string): void {
    this.stored.push(text)
  }
}

async function createStatusBar(theme = new FakeAccentTheme()) {
  const element = document.createElement('status-bar') as StatusBar
  element.subscribeToConnectionStatus = () => () => undefined
  element.repeatEverySecond = () => () => undefined
  element.loadVersion = async () => 'dev'
  element.accentTheme = theme
  document.body.appendChild(element)
  await element.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await element.updateComplete
  return { element, theme }
}

async function openPicker(element: StatusBar): Promise<void> {
  element.querySelector<HTMLButtonElement>('button.status-bar-version')?.click()
  await element.updateComplete
}

async function typeHexadecimalColor(element: StatusBar, text: string): Promise<void> {
  const field = element.querySelector<HTMLInputElement>('input.accent-text')
  field!.value = text
  field!.dispatchEvent(new Event('input', { bubbles: true }))
  await element.updateComplete
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('accent picker', () => {
  it('opens from the version text, which stays the only visible control', async () => {
    const { element } = await createStatusBar()
    const trigger = element.querySelector<HTMLButtonElement>('button.status-bar-version')
    expect(trigger?.textContent?.trim()).toBe('vdev')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(element.querySelector('.appearance-popover')).toBeNull()
  })

  it('shows a labelled dialog with the current accent when opened', async () => {
    const { element } = await createStatusBar()
    await openPicker(element)
    const popover = element.querySelector('.appearance-popover')
    expect(popover?.getAttribute('role')).toBe('dialog')
    expect(popover?.getAttribute('aria-label')).toBe('Appearance')
    expect(element.querySelector<HTMLInputElement>('input.accent-text')?.value).toBe('#f45bcb')
    expect(element.querySelector('button.status-bar-version')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('applies and stores a valid color as it is typed', async () => {
    const { element, theme } = await createStatusBar()
    await openPicker(element)
    await typeHexadecimalColor(element, '#00a3ff')
    expect(theme.applied).toEqual(['#00a3ff'])
    expect(theme.stored).toEqual(['#00a3ff'])
  })

  it('applies the color from the color input too', async () => {
    const { element, theme } = await createStatusBar()
    await openPicker(element)
    const picker = element.querySelector<HTMLInputElement>('input.accent-color')
    picker!.value = '#b6f23b'
    picker!.dispatchEvent(new Event('input', { bubbles: true }))
    expect(theme.applied).toEqual(['#b6f23b'])
  })

  it('explains an invalid color and changes nothing', async () => {
    const { element, theme } = await createStatusBar()
    await openPicker(element)
    await typeHexadecimalColor(element, 'nope')
    expect(element.querySelector('.appearance-error')?.textContent).toContain('hex color')
    expect(theme.applied).toEqual([])
    expect(theme.stored).toEqual([])
  })

  it('goes back to the default accent on reset', async () => {
    const { element, theme } = await createStatusBar()
    await openPicker(element)
    element.querySelector<HTMLButtonElement>('button.accent-reset')?.click()
    expect(theme.applied).toEqual(['#f45bcb'])
    expect(theme.stored).toEqual(['#f45bcb'])
  })

  it('closes with Done', async () => {
    const { element } = await createStatusBar()
    await openPicker(element)
    element.querySelector<HTMLButtonElement>('button.appearance-done')?.click()
    await element.updateComplete
    expect(element.querySelector('.appearance-popover')).toBeNull()
  })

  it('closes when the version text is pressed again', async () => {
    const { element } = await createStatusBar()
    await openPicker(element)
    await openPicker(element)
    expect(element.querySelector('.appearance-popover')).toBeNull()
  })
})
