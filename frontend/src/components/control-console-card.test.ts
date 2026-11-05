import { afterEach, describe, expect, it, vi } from 'vitest'
import './control-console-card'
import type { ControlConsoleCard } from './control-console-card'
import { findButton, mountCard, press } from './control-card-testing'
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

const FLOOD: ConsoleLine[] = [
  { message: 'B:53.5 /60.0 T0:20.6 /0.0', time: 1, type: 'response' },
  { message: '// probe at 53.000,32.000 is z=1.346500', time: 2, type: 'response' },
  { message: '!! Lost communication with MCU', time: 3, type: 'response' },
  { message: 'M115', time: 4, type: 'command' },
]

function shown(card: HTMLElement): string[] {
  return [...card.querySelectorAll('.control-console-text')].map((text) => text.textContent?.trim() ?? '')
}

async function search(card: ControlConsoleCard, text: string): Promise<void> {
  const field = card.querySelector('input[data-field="search"]') as HTMLInputElement
  field.value = text
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await card.updateComplete
}

function input(card: HTMLElement): HTMLInputElement {
  return card.querySelector('input[data-field="gcode"]') as HTMLInputElement
}

async function mountPolling(loadLines: () => Promise<ConsoleLine[]>) {
  const { card, sent } = await mountCard<ControlConsoleCard>('control-console-card')
  card.loadLines = loadLines
  card.pollMilliseconds = 3000
  card.connectedCallback()
  await settle(card)
  return { card, sent }
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
    expect(lines.map((line) => line.querySelector('.control-console-text')?.textContent?.trim())).toEqual([
      '$ M115',
      'FIRMWARE_NAME:Klipper',
    ])
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

  it('shows the time of every line, and gives errors and notes their own look', async () => {
    const { card } = await mount(async () => FLOOD)
    const rows = [...card.querySelectorAll('.control-console-line')]
    expect(rows[0].querySelector('.control-console-time')?.textContent).toMatch(/^\d\d:\d\d:\d\d$/)
    expect(rows[0].classList.contains('note')).toBe(true)
    expect(rows[1].classList.contains('error')).toBe(true)
  })

  it('hides the temperature reports at first and shows them when asked', async () => {
    const { card } = await mount(async () => FLOOD)
    expect(shown(card)).not.toContain('B:53.5 /60.0 T0:20.6 /0.0')
    const toggle = card.querySelector('input[data-field="hide-temperatures"]') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    toggle.click()
    await card.updateComplete
    expect(shown(card)).toContain('B:53.5 /60.0 T0:20.6 /0.0')
  })

  it('searches the lines and says how many are left', async () => {
    const { card } = await mount(async () => FLOOD)
    await search(card, 'PROBE')
    expect(shown(card)).toEqual(['// probe at 53.000,32.000 is z=1.346500'])
    expect(card.querySelector('.control-console-count')?.textContent).toContain('1 of 4')
  })

  it('says so when no line matches', async () => {
    const { card } = await mount(async () => FLOOD)
    await search(card, 'nothing like this')
    expect(card.textContent).toContain('No lines match')
  })

  it('clears the view, and shows the lines that come after it', async () => {
    let lines = FLOOD
    const { card } = await mount(async () => lines)
    await press(card, 'Clear')
    expect(shown(card)).toEqual([])
    lines = [...FLOOD, { message: 'ok', time: 9, type: 'response' }]
    await card.refresh()
    await card.updateComplete
    expect(shown(card)).toEqual(['ok'])
    await press(card, 'Show all')
    expect(shown(card)).toHaveLength(4)
  })

  it('copies the lines that are shown', async () => {
    const copied: string[] = []
    const { card } = await mount(async () => FLOOD)
    card.copyText = async (text) => void copied.push(text)
    await search(card, 'm115')
    await press(card, 'Copy')
    expect(copied).toHaveLength(1)
    expect(copied[0]).toMatch(/^\d\d:\d\d:\d\d \$ M115$/)
    expect(findButton(card, 'Copy').textContent).toContain('Copied')
  })

  it('reads the lines again by itself', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let reads = 0
    const { card } = await mountPolling(async () => {
      reads += 1
      return FLOOD
    })
    expect(reads).toBe(1)
    vi.advanceTimersByTime(3000)
    await settle(card)
    expect(reads).toBe(2)
    card.remove()
    vi.advanceTimersByTime(9000)
    expect(reads).toBe(2)
    vi.useRealTimers()
  })

  it('follows the end of the log until you scroll up, and again when you scroll down', async () => {
    const { card } = await mount(async () => FLOOD)
    const log = card.querySelector('.control-console-log') as HTMLElement
    expect(findButton(card, 'Follow').getAttribute('aria-pressed')).toBe('true')
    Object.defineProperties(log, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 100, configurable: true },
    })
    log.scrollTop = 200
    log.dispatchEvent(new Event('scroll'))
    await card.updateComplete
    expect(findButton(card, 'Follow').getAttribute('aria-pressed')).toBe('false')
    log.scrollTop = 900
    log.dispatchEvent(new Event('scroll'))
    await card.updateComplete
    expect(findButton(card, 'Follow').getAttribute('aria-pressed')).toBe('true')
  })

  it('does not move the log while you are not following', async () => {
    const { card } = await mount(async () => FLOOD)
    await press(card, 'Follow')
    const log = card.querySelector('.control-console-log') as HTMLElement
    Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true })
    log.scrollTop = 120
    await search(card, '')
    expect(log.scrollTop).toBe(120)
  })

  it('follows the end of the log again when Follow is pressed', async () => {
    const { card } = await mount(async () => FLOOD)
    await press(card, 'Follow')
    expect(findButton(card, 'Follow').getAttribute('aria-pressed')).toBe('false')
    await press(card, 'Follow')
    expect(findButton(card, 'Follow').getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the search and the clear buttons usable while printing', async () => {
    const { card } = await mount(async () => FLOOD, true)
    expect((card.querySelector('input[data-field="search"]') as HTMLInputElement).disabled).toBe(false)
    expect(findButton(card, 'Clear').disabled).toBe(false)
  })
})
