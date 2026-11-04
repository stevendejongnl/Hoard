import { afterEach, describe, expect, it } from 'vitest'
import './control-console-card'
import type { ControlConsoleCard } from './control-console-card'
import { findButton, mountCard } from './control-card-testing'
import type { ConsoleLine } from '../types'

const LINES: ConsoleLine[] = [
  { message: 'M115', time: 1, type: 'command' },
  { message: 'FIRMWARE_NAME:Klipper', time: 2, type: 'response' },
]

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(loadLines: () => Promise<ConsoleLine[]> = async () => LINES, locked = false) {
  const { card, sent } = await mountCard<ControlConsoleCard>('control-console-card', { locked })
  card.loadLines = loadLines
  card.connectedCallback()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await card.updateComplete
  return { card, sent }
}

function input(card: HTMLElement): HTMLInputElement {
  return card.querySelector('input[data-field="gcode"]') as HTMLInputElement
}

async function type(card: HTMLElement, text: string): Promise<void> {
  input(card).value = text
  input(card).dispatchEvent(new Event('input', { bubbles: true }))
}

async function settle(card: ControlConsoleCard): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await card.updateComplete
}

describe('the console card', () => {
  it('shows the lines of the printer, the commands marked', async () => {
    const { card } = await mount()
    const lines = [...card.querySelectorAll('.control-console-line')]
    expect(lines.map((line) => line.textContent?.trim())).toEqual(['> M115', 'FIRMWARE_NAME:Klipper'])
    expect(lines[0].classList.contains('command')).toBe(true)
  })

  it('sends the line that was typed and clears the field', async () => {
    const { card, sent } = await mount()
    await type(card, 'M105')
    findButton(card, 'Send').click()
    await settle(card)
    expect(sent).toEqual([{ route: 'gcode', body: { script: 'M105' } }])
    expect(input(card).value).toBe('')
  })

  it('sends the line with Enter as well', async () => {
    const { card, sent } = await mount()
    await type(card, 'M105')
    input(card).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle(card)
    expect(sent).toEqual([{ route: 'gcode', body: { script: 'M105' } }])
  })

  it('sends nothing for an empty line', async () => {
    const { card, sent } = await mount()
    await type(card, '   ')
    findButton(card, 'Send').click()
    await settle(card)
    expect(sent).toEqual([])
  })

  it('keeps what was typed when the printer refuses it', async () => {
    const { card } = await mount()
    card.send = async () => {
      throw new Error('refused')
    }
    await type(card, 'G28 X')
    findButton(card, 'Send').click()
    await settle(card)
    expect(input(card).value).toBe('G28 X')
    expect(card.querySelector('.control-card-failure')).not.toBeNull()
  })

  it('reads the lines again after a command', async () => {
    let reads = 0
    const { card } = await mount(async () => {
      reads += 1
      return LINES
    })
    await type(card, 'M105')
    findButton(card, 'Send').click()
    await settle(card)
    expect(reads).toBe(2)
  })

  it('has the field and Send locked while printing, but still shows the lines', async () => {
    const { card, sent } = await mount(undefined, true)
    expect(input(card).disabled).toBe(true)
    expect(findButton(card, 'Send').disabled).toBe(true)
    expect(card.querySelectorAll('.control-console-line')).toHaveLength(2)
    findButton(card, 'Send').click()
    expect(sent).toEqual([])
    expect(card.textContent).toContain('Locked while the printer is printing')
  })

  it('says so when the lines cannot be read', async () => {
    const { card } = await mount(async () => {
      throw new Error('offline')
    })
    expect(card.textContent).toContain('Could not read the console')
  })
})
