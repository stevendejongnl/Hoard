import { afterEach, describe, expect, it } from 'vitest'
import './control-calibration-card'
import type { ControlCalibrationCard } from './control-calibration-card'
import { IDLE_STATUS, findButton, listButtonLabels, mountCard, press } from './control-card-testing'
import type { ConsoleLine, ControlStatus } from '../types'

const PROBING: ControlStatus = { ...IDLE_STATUS, manual_probe: { active: true, z: 1.25 } }
const RESULT: ConsoleLine[] = [
  { message: '// front_left (base) : x=40.0, y=40.0, z=2.3', time: 1, type: 'response' },
  { message: '// front_right : x=210.0, y=40.0, z=2.2 : adjust CW 00:15', time: 2, type: 'response' },
]

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(options: { status?: ControlStatus; locked?: boolean; lines?: ConsoleLine[] } = {}) {
  const { card, sent } = await mountCard<ControlCalibrationCard>('control-calibration-card', options)
  card.loadLines = async () => options.lines ?? []
  card.connectedCallback()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await card.updateComplete
  return { card, sent }
}

describe('the calibration card', () => {
  it('has the three ways to calibrate, and a way to save what they found', async () => {
    const { card } = await mount()
    expect(listButtonLabels(card)).toEqual([
      'Calibrate bed mesh',
      'Screws tilt adjust',
      'Manual probe',
      'Calibrate probe offset',
      'Save config',
    ])
  })

  it('opens the probe offset dialog from its button', async () => {
    const { card } = await mount()
    let opened = 0
    card.openProbeOffsetDialog = () => {
      opened += 1
    }
    await press(card, 'Calibrate probe offset')
    expect(opened).toBe(1)
  })

  it('opens the save config dialog from its button', async () => {
    const { card } = await mount()
    let opened = 0
    card.openSaveDialog = () => {
      opened += 1
    }
    await press(card, 'Save config')
    expect(opened).toBe(1)
  })

  it('has the save config button locked while printing', async () => {
    const { card } = await mount({ locked: true })
    expect(findButton(card, 'Save config').disabled).toBe(true)
  })

  it('starts each one with its own command', async () => {
    const { card, sent } = await mount()
    await press(card, 'Calibrate bed mesh')
    await press(card, 'Screws tilt adjust')
    await press(card, 'Manual probe')
    expect(sent.map((command) => command.route)).toEqual([
      'calibrate/bed_mesh',
      'calibrate/screws_tilt',
      'calibrate/manual_probe',
    ])
  })

  it('has all three locked while printing, and says why', async () => {
    const { card, sent } = await mount({ locked: true })
    expect(
      ['Calibrate bed mesh', 'Screws tilt adjust', 'Manual probe'].every((label) => findButton(card, label).disabled),
    ).toBe(true)
    await press(card, 'Manual probe')
    expect(sent).toEqual([])
    expect(card.textContent).toContain('Locked while the printer is printing')
  })

  it('shows no probe panel while nothing is being probed', async () => {
    const { card } = await mount()
    expect(card.querySelector('.control-probe-panel')).toBeNull()
  })

  it('shows the probe panel with the height while a probe is being moved by hand', async () => {
    const { card } = await mount({ status: PROBING })
    const panel = card.querySelector('.control-probe-panel') as HTMLElement
    expect(panel.textContent).toContain('1.25')
    expect(listButtonLabels(panel)).toEqual(['0.01', '0.05', '0.1', '0.5', 'Probe down', 'Probe up', 'Accept', 'Abort'])
  })

  it('moves the probe by the chosen step', async () => {
    const { card, sent } = await mount({ status: PROBING })
    await press(card, 'Probe down')
    await press(card, '0.5')
    await press(card, 'Probe up')
    expect(sent).toEqual([
      { route: 'probe', body: { direction: 'down', step: 0.1 } },
      { route: 'probe', body: { direction: 'up', step: 0.5 } },
    ])
  })

  it('accepts or aborts the probe', async () => {
    const { card, sent } = await mount({ status: PROBING })
    await press(card, 'Accept')
    await press(card, 'Abort')
    expect(sent.map((command) => command.route)).toEqual(['calibrate/accept', 'calibrate/abort'])
  })

  it('lists the screws of the last screws tilt adjust with what to turn', async () => {
    const { card } = await mount({ lines: RESULT })
    const rows = [...card.querySelectorAll('.control-screw-row')].map((row) =>
      [...row.children].map((part) => part.textContent?.trim()).join(' '),
    )
    expect(rows).toEqual(['front_left base', 'front_right CW 00:15'])
  })

  it('says what to do when there is no result yet', async () => {
    const { card } = await mount()
    expect(card.textContent).toContain('Run the screws tilt adjust to see how far to turn each screw')
  })

  it('reads the console again after the screws tilt adjust has been started', async () => {
    let reads = 0
    const { card } = await mountCard<ControlCalibrationCard>('control-calibration-card')
    card.loadLines = async () => {
      reads += 1
      return RESULT
    }
    card.connectedCallback()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await press(card, 'Screws tilt adjust')
    expect(reads).toBe(2)
  })
})
