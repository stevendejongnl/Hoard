import { afterEach, describe, expect, it } from 'vitest'
import './klipper-banner'
import type { KlipperBanner } from './klipper-banner'
import type { KlipperState } from '../types'

const SHUTDOWN: KlipperState = {
  state: 'shutdown',
  message:
    "Lost communication with MCU 'mcu'\nOnce the underlying issue is corrected, use FIRMWARE_RESTART\nPrinter is shutdown",
}

interface Setup {
  banner: KlipperBanner
  calls: string[]
  tick: () => void
  stopped: { value: boolean }
  setState: (state: KlipperState) => void
}

async function settle(banner: KlipperBanner): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await banner.updateComplete
}

async function mount(first: KlipperState | Error = SHUTDOWN, failures: { restart?: boolean } = {}): Promise<Setup> {
  const calls: string[] = []
  const stopped = { value: false }
  let current: KlipperState | Error = first
  let tick: () => void = () => undefined
  const banner = document.createElement('klipper-banner') as KlipperBanner
  banner.loadState = async () => {
    if (current instanceof Error) throw current
    return current
  }
  banner.restartKlipper = async () => {
    calls.push('restart klipper')
    if (failures.restart) throw new Error('refused')
  }
  banner.restartFirmware = async () => void calls.push('restart firmware')
  banner.repeatEvery = (callback) => {
    tick = callback
    return () => (stopped.value = true)
  }
  document.body.appendChild(banner)
  await settle(banner)
  return { banner, calls, tick: () => tick(), stopped, setState: (state) => (current = state) }
}

function press(banner: KlipperBanner, label: string): void {
  const found = [...banner.querySelectorAll('button')].find(
    (button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === label,
  )
  if (!found) throw new Error(`no button "${label}"`)
  found.click()
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the Klipper banner', () => {
  it('shows nothing while Klipper is ready', async () => {
    const { banner } = await mount({ state: 'ready', message: 'Printer is ready' })
    expect(banner.querySelector('.klipper-banner')).toBeNull()
  })

  it('shows nothing when the printer host cannot be reached, because the printer may be off', async () => {
    const { banner } = await mount(new Error('502'))
    expect(banner.querySelector('.klipper-banner')).toBeNull()
  })

  it('shows what is wrong in one line: the state and the first line of the message', async () => {
    const { banner } = await mount()
    const text = banner.querySelector('.klipper-banner-text')?.textContent ?? ''
    expect(text).toContain('Klipper shutdown')
    expect(text).toContain("Lost communication with MCU 'mcu'")
    expect(text).not.toContain('Once the underlying issue')
  })

  it.each([
    ['error', 'Klipper error'],
    ['startup', 'Klipper starting'],
    ['disconnected', 'Klipper disconnected'],
  ])('names the state %s', async (state, words) => {
    const { banner } = await mount({ state, message: '' })
    expect(banner.querySelector('.klipper-banner-text')?.textContent).toContain(words)
  })

  it('marks a shutdown or an error as an alarm and a startup as waiting', async () => {
    const alarm = await mount()
    expect(alarm.banner.querySelector('.klipper-banner')?.classList.contains('alarm')).toBe(true)
    document.body.replaceChildren()
    const waiting = await mount({ state: 'startup', message: 'Printer is not ready' })
    expect(waiting.banner.querySelector('.klipper-banner')?.classList.contains('alarm')).toBe(false)
  })

  it('opens the whole message and the logs when it is pressed, and closes again', async () => {
    const { banner } = await mount()
    expect(banner.querySelector('.klipper-banner-details')).toBeNull()
    press(banner, 'Show details')
    await banner.updateComplete
    const details = banner.querySelector('.klipper-banner-details') as HTMLElement
    expect(details.textContent).toContain('Once the underlying issue is corrected')
    expect(details.textContent).toContain('Printer is shutdown')
    press(banner, 'Hide details')
    await banner.updateComplete
    expect(banner.querySelector('.klipper-banner-details')).toBeNull()
  })

  it('links the logs to download, in the details', async () => {
    const { banner } = await mount()
    press(banner, 'Show details')
    await banner.updateComplete
    const links = [...banner.querySelectorAll<HTMLAnchorElement>('.klipper-banner-details a')]
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['klippy.log', '/api/control/logs/klippy'],
      ['moonraker.log', '/api/control/logs/moonraker'],
    ])
    expect(links.every((link) => link.hasAttribute('download'))).toBe(true)
  })

  it('has the two restart buttons, and sends each to the printer', async () => {
    const { banner, calls } = await mount()
    press(banner, 'Restart Klipper')
    await settle(banner)
    press(banner, 'Firmware restart')
    await settle(banner)
    expect(calls).toEqual(['restart klipper', 'restart firmware'])
  })

  it('reads the state again after a restart', async () => {
    const setup = await mount()
    setup.setState({ state: 'ready', message: 'Printer is ready' })
    press(setup.banner, 'Restart Klipper')
    await settle(setup.banner)
    expect(setup.banner.querySelector('.klipper-banner')).toBeNull()
  })

  it('says so when a restart is refused, and keeps the banner', async () => {
    const { banner } = await mount(SHUTDOWN, { restart: true })
    press(banner, 'Restart Klipper')
    await settle(banner)
    expect(banner.querySelector('.klipper-banner-failure')?.textContent).toContain('Could not send the command')
    expect(banner.querySelector('.klipper-banner')).not.toBeNull()
  })

  it('reads the state again on every tick, so it appears and goes by itself', async () => {
    const setup = await mount({ state: 'ready', message: '' })
    setup.setState(SHUTDOWN)
    setup.tick()
    await settle(setup.banner)
    expect(setup.banner.querySelector('.klipper-banner')).not.toBeNull()
    setup.setState({ state: 'ready', message: '' })
    setup.tick()
    await settle(setup.banner)
    expect(setup.banner.querySelector('.klipper-banner')).toBeNull()
  })

  it('stops reading when the page is left', async () => {
    const { banner, stopped } = await mount()
    banner.remove()
    expect(stopped.value).toBe(true)
  })
})
