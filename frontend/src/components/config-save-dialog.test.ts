import { afterEach, describe, expect, it } from 'vitest'
import './config-save-dialog'
import type { ConfigSaveDialog } from './config-save-dialog'
import { HttpError } from '../api'
import type { KlipperState, PendingConfig } from '../types'

const WAITING: PendingConfig = {
  pending: true,
  changes: [{ section: 'bltouch', key: 'z_offset', old: '-2.35', new: '-2.400' }],
}
const NOTHING: PendingConfig = { pending: false, changes: [] }
const READY: KlipperState = { state: 'ready', message: '' }
const SHUTDOWN: KlipperState = { state: 'shutdown', message: "Lost communication with MCU 'mcu'" }

interface Setup {
  pending?: PendingConfig
  save?: () => Promise<unknown>
  klipper?: (KlipperState | Error)[]
}

afterEach(() => {
  document.body.replaceChildren()
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function mount(setup: Setup = {}) {
  const calls: string[] = []
  const timers: (() => void)[] = []
  const states = [...(setup.klipper ?? [new Error('offline'), READY])]
  const dialog = document.createElement('config-save-dialog') as ConfigSaveDialog
  dialog.loadPending = async () => setup.pending ?? WAITING
  dialog.save = async () => {
    calls.push('save')
    return setup.save ? setup.save() : { ok: true }
  }
  dialog.readKlipperState = async () => {
    const answer = states.length > 1 ? states.shift()! : states[0]
    if (answer instanceof Error) throw answer
    return answer
  }
  dialog.restartFirmware = async () => {
    calls.push('firmware restart')
    return { ok: true }
  }
  dialog.sleep = async () => undefined
  dialog.startTimer = (callback) => {
    timers.push(callback)
    return () => undefined
  }
  dialog.close = () => calls.push('close')
  dialog.minimumRestartMilliseconds = 0
  document.body.appendChild(dialog)
  await dialog.updateComplete
  await flush()
  await dialog.updateComplete
  return { dialog, calls, timers }
}

const holdButton = (dialog: ConfigSaveDialog) =>
  dialog.querySelector<HTMLButtonElement>('button[aria-label="Hold to save and restart"]')

async function hold(dialog: ConfigSaveDialog, timers: (() => void)[]) {
  holdButton(dialog)!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  timers.forEach((callback) => callback())
  for (let turn = 0; turn < 5; turn++) {
    await flush()
    await dialog.updateComplete
  }
}

describe('the save config dialog', () => {
  it('lists what waits to be saved, with the old and the new value', async () => {
    const { dialog } = await mount()
    expect(dialog.textContent).toContain('bltouch')
    expect(dialog.textContent).toContain('z_offset')
    expect(dialog.textContent).toContain('-2.35')
    expect(dialog.textContent).toContain('-2.400')
  })

  it('says that saving restarts Klipper and switches the heaters off', async () => {
    const { dialog } = await mount()
    expect(dialog.textContent).toContain('Saving restarts Klipper')
    expect(dialog.textContent).toContain('heaters switch off')
  })

  it('offers no save button when nothing waits, and says so', async () => {
    const { dialog } = await mount({ pending: NOTHING })
    expect(dialog.textContent).toContain('Nothing is waiting to be saved')
    expect(holdButton(dialog)).toBeNull()
  })

  it('does not save on a click, only on a hold', async () => {
    const { dialog, calls } = await mount()
    holdButton(dialog)!.click()
    await flush()
    expect(calls).toEqual([])
  })

  it('saves once the button was held', async () => {
    const { dialog, calls, timers } = await mount()
    await hold(dialog, timers)
    expect(calls).toContain('save')
  })

  it('follows the restart and is done when Klipper is ready', async () => {
    const { dialog, timers } = await mount()
    await hold(dialog, timers)
    expect(dialog.textContent).toContain('Klipper is ready')
    expect(dialog.querySelector<HTMLButtonElement>('button.config-save-close')!.disabled).toBe(false)
  })

  it('says why a save was refused, and does not wait for a restart', async () => {
    const refusal = new HttpError(409, 'Conflict', 'Locked while the printer is printing')
    const { dialog, timers } = await mount({
      save: async () => {
        throw refusal
      },
    })
    await hold(dialog, timers)
    expect(dialog.textContent).toContain('Locked while the printer is printing')
    expect(dialog.textContent).not.toContain('Restarting Klipper')
  })

  it('shows what Klipper says when it does not come back, and offers a firmware restart', async () => {
    const { dialog, calls, timers } = await mount({ klipper: [new Error('offline'), SHUTDOWN] })
    await hold(dialog, timers)
    expect(dialog.textContent).toContain('Klipper is not ready')
    expect(dialog.textContent).toContain("Lost communication with MCU 'mcu'")
    dialog.querySelector<HTMLButtonElement>('button.config-save-firmware-restart')!.click()
    await flush()
    expect(calls).toContain('firmware restart')
  })

  it('cannot be closed while Klipper restarts', async () => {
    const { dialog, timers } = await mount({ klipper: [new Error('offline')] })
    dialog.sleep = () => new Promise(() => undefined)
    void hold(dialog, timers)
    await flush()
    await dialog.updateComplete
    expect(dialog.querySelector<HTMLButtonElement>('button.config-save-close')!.disabled).toBe(true)
  })

  it('closes on the close button and on Escape before it saves', async () => {
    const { dialog, calls } = await mount()
    dialog.querySelector<HTMLButtonElement>('button.config-save-close')!.click()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(calls.filter((call) => call === 'close')).toHaveLength(2)
  })
})
