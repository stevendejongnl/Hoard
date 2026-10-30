import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { askForConfirmation } from './confirmation-dialog'

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

async function showQuestion(message: string): Promise<{ answer: Promise<boolean> }> {
  const answer = askForConfirmation(message)
  await document.querySelector('confirmation-dialog')?.updateComplete
  return { answer }
}

function pressButton(selector: string): void {
  document.querySelector<HTMLButtonElement>(`confirmation-dialog ${selector}`)!.click()
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('confirmation dialog', () => {
  it('shows the question', async () => {
    await showQuestion('Switch off Filament dryer?')
    const dialog = document.querySelector('confirmation-dialog [role="alertdialog"]')
    expect(dialog?.textContent).toContain('Switch off Filament dryer?')
  })

  it('answers yes only on the confirm button, and closes', async () => {
    const { answer } = await showQuestion('Sure?')
    pressButton('.confirm-button')
    expect(await answer).toBe(true)
    expect(document.querySelector('confirmation-dialog')).toBeNull()
  })

  it('answers no on the cancel button, and closes', async () => {
    const { answer } = await showQuestion('Sure?')
    pressButton('.cancel-confirmation-button')
    expect(await answer).toBe(false)
    expect(document.querySelector('confirmation-dialog')).toBeNull()
  })

  it('answers no on a tap outside the dialog', async () => {
    const { answer } = await showQuestion('Sure?')
    document.querySelector<HTMLElement>('confirmation-dialog .ready-overlay')!.click()
    expect(await answer).toBe(false)
  })

  it('answers no on Escape', async () => {
    const { answer } = await showQuestion('Sure?')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(await answer).toBe(false)
  })

  it('focuses cancel, so a stray Enter does not confirm', async () => {
    await showQuestion('Sure?')
    expect(document.activeElement?.className).toContain('cancel-confirmation-button')
  })
})

describe('questions in the app', () => {
  it('never use the native dialog, which some phones answer without showing it', () => {
    const offenders = listSourceFiles(resolve(process.cwd(), 'src')).filter((path) =>
      readFileSync(path, 'utf8').includes('window.confirm'),
    )
    expect(offenders).toEqual([])
  })
})
