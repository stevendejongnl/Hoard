import { nothing } from 'lit'
import { afterEach, describe, expect, it } from 'vitest'
import './probe-offset-dialog'
import type { ProbeOffsetDialog } from './probe-offset-dialog'
import { IDLE_STATUS, findButton } from './control-card-testing'
import { HttpError } from '../api'
import type { ControlStatus, PendingConfig, ProbeOffset } from '../types'

const COOL_AND_HOMED: ControlStatus = {
  ...IDLE_STATUS,
  heaters: [
    { key: 'extruder', label: 'Nozzle', temperature: 31, target: 0 },
    { key: 'heater_bed', label: 'Bed', temperature: 28, target: 0 },
  ],
}
const NOT_HOMED: ControlStatus = { ...COOL_AND_HOMED, homed: '' }
const PRINTING: ControlStatus = { ...COOL_AND_HOMED, state: 'printing', locked: true }
const PROBING: ControlStatus = { ...COOL_AND_HOMED, manual_probe: { active: true, z: 0.35 } }
const PROBE: ProbeOffset = { section: 'bltouch', z_offset: '-2.35' }
const MEASURED: PendingConfig = {
  pending: true,
  changes: [{ section: 'bltouch', key: 'z_offset', old: '-2.35', new: '-2.400' }],
}

interface Setup {
  status?: ControlStatus
  probing?: ControlStatus
  pending?: PendingConfig
  failWith?: Error
}

afterEach(() => {
  document.body.replaceChildren()
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function settle(dialog: ProbeOffsetDialog) {
  for (let turn = 0; turn < 4; turn++) {
    await flush()
    await dialog.updateComplete
  }
}

async function mount(setup: Setup = {}) {
  const sent: { route: string; body: object }[] = []
  const calls: string[] = []
  let current = setup.status ?? COOL_AND_HOMED
  const dialog = document.createElement('probe-offset-dialog') as ProbeOffsetDialog
  dialog.loadStatus = async () => current
  dialog.loadProbeOffset = async () => PROBE
  dialog.loadPending = async () => setup.pending ?? MEASURED
  dialog.send = async (route, body) => {
    if (setup.failWith) throw setup.failWith
    sent.push({ route, body })
    if (route === 'calibrate/probe_calibrate') current = setup.probing ?? PROBING
    return { ok: true }
  }
  dialog.sleep = () => new Promise(() => undefined)
  dialog.renderCamera = () => nothing
  dialog.close = () => calls.push('close')
  dialog.openSaveDialog = () => calls.push('open save dialog')
  document.body.appendChild(dialog)
  await settle(dialog)
  return { dialog, sent, calls }
}

async function press(dialog: ProbeOffsetDialog, label: string) {
  findButton(dialog, label).click()
  await settle(dialog)
}

describe('the probe offset dialog, before it starts', () => {
  it('shows the offset of the probe and the temporary offset of the babysteps apart', async () => {
    const { dialog } = await mount()
    expect(dialog.textContent).toContain('-2.350 mm')
    expect(dialog.textContent).toContain('-0.120 mm')
    expect(dialog.textContent).toContain('Probe offset (printer.cfg)')
    expect(dialog.textContent).toContain('G-code offset (babystep)')
  })

  it('checks that the printer is idle, cool and homed', async () => {
    const { dialog } = await mount()
    expect(dialog.textContent).toContain('Printer is idle')
    expect(dialog.textContent).toContain('Nozzle is cool')
    expect(dialog.textContent).toContain('Printer is homed')
  })

  it('homes first when the printer is not homed', async () => {
    const { dialog, sent } = await mount({ status: NOT_HOMED })
    expect(dialog.textContent).toContain('Printer is not homed')
    await press(dialog, 'Home and start')
    expect(sent.map((command) => command.route)).toEqual(['home', 'calibrate/probe_calibrate'])
  })

  it('starts the probe calibration at once when the printer is homed', async () => {
    const { dialog, sent } = await mount()
    await press(dialog, 'Start calibration')
    expect(sent.map((command) => command.route)).toEqual(['calibrate/probe_calibrate'])
  })

  it('cannot start while the printer prints, and says so', async () => {
    const { dialog } = await mount({ status: PRINTING })
    expect(dialog.textContent).toContain('Printer is printing')
    expect(findButton(dialog, 'Start calibration').disabled).toBe(true)
  })

  it('can be cancelled', async () => {
    const { dialog, calls } = await mount()
    await press(dialog, 'Cancel')
    expect(calls).toEqual(['close'])
  })

  it('says why a command was refused', async () => {
    const { dialog } = await mount({ failWith: new HttpError(409, 'Conflict', 'Locked while the printer is printing') })
    await press(dialog, 'Start calibration')
    expect(dialog.textContent).toContain('Locked while the printer is printing')
  })
})

describe('the probe offset dialog, while measuring', () => {
  async function measuring() {
    const mounted = await mount()
    await press(mounted.dialog, 'Start calibration')
    return mounted
  }

  it('shows the height of the nozzle above the bed', async () => {
    const { dialog } = await measuring()
    expect(dialog.textContent).toContain('0.35 mm')
  })

  it('moves the nozzle by the step of the key', async () => {
    const { dialog, sent } = await measuring()
    await press(dialog, 'Lower 0.1 mm')
    await press(dialog, 'Raise 0.05 mm')
    expect(sent.slice(1)).toEqual([
      { route: 'probe', body: { direction: 'down', step: 0.1 } },
      { route: 'probe', body: { direction: 'up', step: 0.05 } },
    ])
  })

  it('aborts and closes without changing anything', async () => {
    const { dialog, sent, calls } = await measuring()
    await press(dialog, 'Abort')
    expect(sent.at(-1)?.route).toBe('calibrate/abort')
    expect(calls).toEqual(['close'])
  })

  it('accepts the height and shows the old and the new offset, not saved yet', async () => {
    const { dialog, sent } = await measuring()
    await press(dialog, 'Accept this height')
    expect(sent.at(-1)?.route).toBe('calibrate/accept')
    expect(dialog.textContent).toContain('-2.350 mm')
    expect(dialog.textContent).toContain('-2.400 mm')
    expect(dialog.textContent).toContain('-0.050 mm')
    expect(dialog.textContent).toContain('Not saved yet')
  })
})

describe('the probe offset dialog, when it is measured', () => {
  async function reviewing() {
    const mounted = await mount()
    await press(mounted.dialog, 'Start calibration')
    await press(mounted.dialog, 'Accept this height')
    return mounted
  }

  it('hands over to the save dialog and closes', async () => {
    const { dialog, calls } = await reviewing()
    await press(dialog, 'Continue to save')
    expect(calls).toEqual(['close', 'open save dialog'])
  })

  it('measures again', async () => {
    const { dialog, sent } = await reviewing()
    await press(dialog, 'Measure again')
    expect(sent.at(-1)?.route).toBe('calibrate/probe_calibrate')
  })

  it('can be left without saving', async () => {
    const { dialog, calls } = await reviewing()
    await press(dialog, 'Not now')
    expect(calls).toEqual(['close'])
  })

  it('says so when the measurement left no new offset', async () => {
    const mounted = await mount({ pending: { pending: false, changes: [] } })
    await press(mounted.dialog, 'Start calibration')
    await press(mounted.dialog, 'Accept this height')
    expect(mounted.dialog.textContent).toContain('No new offset was found')
    expect(mounted.dialog.textContent).not.toContain('Continue to save')
  })
})

describe('the probe offset dialog, with a babystep', () => {
  it('can apply the babystep to the probe offset instead of measuring', async () => {
    const { dialog, sent } = await mount()
    await press(dialog, 'Apply the babystep to the probe offset')
    expect(sent.map((command) => command.route)).toEqual(['calibrate/apply_probe_offset'])
    expect(dialog.textContent).toContain('Not saved yet')
  })

  it('offers no babystep to apply when there is none', async () => {
    const { dialog } = await mount({ status: { ...COOL_AND_HOMED, z_offset: 0 } })
    expect(() => findButton(dialog, 'Apply the babystep to the probe offset')).toThrow()
  })
})
