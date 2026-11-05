import { afterEach, describe, expect, it } from 'vitest'
import type { AutoPowerOffStatus, HomeAssistantSwitch, PiStats, Power, PrinterState, Temps } from '../types'
import './printer-parameter-panel'
import type { PrinterParameterPanel } from './printer-parameter-panel'

const printingState: PrinterState = {
  state: 'printing',
  filename: 'Piedistallo+per+lego+F1+2Posti.gcode',
  progress: 1.8,
  layer: null,
  layer_total: null,
  time_remaining: 415,
  filament_used: 660,
  speed: 30,
  z_position: 0.6,
}
const temperatures: Temps = { hotend_actual: 204.9, hotend_target: 205, bed_actual: 60, bed_target: 60 }
const power: Power = { watts: 109, eur_per_kwh: 0.16, switch: 'on' }
const piStats: PiStats = { cpu_temp: 37.6, cpu_load: 3.9, memory_pct: 32.1, disk_pct: 66.2, uptime_s: 85140 }

interface Calls {
  paused: number
  resumed: number
  cancelled: number
  powerSwitches: boolean[]
  confirmations: string[]
}

async function createPanel(
  calls: Calls,
  properties: Partial<PrinterParameterPanel> = {},
  isConfirmed = true,
): Promise<PrinterParameterPanel> {
  const panel = document.createElement('printer-parameter-panel') as PrinterParameterPanel
  panel.printerState = printingState
  panel.temperatures = temperatures
  panel.power = power
  panel.piStats = piStats
  panel.estimatedSeconds = 12840
  panel.now = () => new Date('2026-10-27T14:56:00Z').getTime()
  panel.timeZone = 'UTC'
  panel.pausePrint = async () => void (calls.paused += 1)
  panel.resumePrint = async () => void (calls.resumed += 1)
  panel.cancelPrint = async () => void (calls.cancelled += 1)
  panel.switchPower = async (turnOn) => void calls.powerSwitches.push(turnOn)
  panel.confirmAction = async (message) => {
    calls.confirmations.push(message)
    return isConfirmed
  }
  Object.assign(panel, properties)
  document.body.appendChild(panel)
  await panel.updateComplete
  return panel
}

function createCalls(): Calls {
  return { paused: 0, resumed: 0, cancelled: 0, powerSwitches: [], confirmations: [] }
}

function readField(panel: PrinterParameterPanel, name: string): string {
  return panel.querySelector(`[data-field="${name}"]`)?.textContent?.trim() ?? ''
}

async function press(panel: PrinterParameterPanel, selector: string): Promise<void> {
  panel.querySelector<HTMLElement>(selector)?.click()
  await panel.updateComplete
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('print job section', () => {
  it('shows the file and the progress of the print', async () => {
    const panel = await createPanel(createCalls())
    expect(panel.querySelector('.print-file-line')?.textContent).toBe('Piedistallo+per+lego+F1+2Posti.gcode')
    expect(readField(panel, 'progress')).toBe('1.8%')
    expect(readField(panel, 'elapsed')).toBe('6m 55s')
  })

  it('works out the remaining time and finish time from the estimate of the file', async () => {
    const panel = await createPanel(createCalls())
    expect(readField(panel, 'remaining')).toBe('3h 27m')
    expect(readField(panel, 'finish')).toBe('18:23')
  })

  it('shows speed, filament and layer', async () => {
    const panel = await createPanel(createCalls())
    expect(readField(panel, 'speed')).toBe('30mm/s')
    expect(readField(panel, 'filament')).toBe('0.66m')
    expect(readField(panel, 'layer')).toBe('—')
  })

  it('shows the layer when the printer reports it', async () => {
    const panel = await createPanel(createCalls(), { printerState: { ...printingState, layer: 12, layer_total: 180 } })
    expect(readField(panel, 'layer')).toBe('12 / 180')
  })

  it('has no values and no buttons when nothing is printing', async () => {
    const panel = await createPanel(createCalls(), { printerState: { ...printingState, state: 'standby' } })
    expect(readField(panel, 'progress')).toBe('—')
    expect(panel.querySelector('button.pause-button')).toBeNull()
  })
})

describe('temperature, power and Raspberry Pi sections', () => {
  it('shows the actual and target temperature of each heater and their status', async () => {
    const panel = await createPanel(createCalls())
    expect(readField(panel, 'hotend-actual')).toBe('204.9°C')
    expect(readField(panel, 'hotend-target')).toBe('205°C')
    expect(readField(panel, 'bed-actual')).toBe('60.0°C')
    expect(readField(panel, 'bed-target')).toBe('60°C')
    expect(panel.querySelector('.temperature-status')?.textContent).toBe('actual / target · both at target')
  })

  it('shows the draw and the price of power', async () => {
    const panel = await createPanel(createCalls())
    expect(readField(panel, 'draw')).toBe('109W')
    expect(readField(panel, 'price')).toBe('0.16€/kWh')
  })

  it('shows the power switch as on and switches it off when pressed', async () => {
    const callLog = createCalls()
    const panel = await createPanel(callLog)
    const toggle = panel.querySelector('button.power-switch')
    expect(toggle?.getAttribute('aria-checked')).toBe('true')
    await press(panel, 'button.power-switch')
    expect(callLog.powerSwitches).toEqual([false])
  })

  it('shows the statistics of the Raspberry Pi', async () => {
    const panel = await createPanel(createCalls())
    expect(readField(panel, 'cpu-temperature')).toBe('37.6°C')
    expect(readField(panel, 'cpu-load')).toBe('3.9%')
    expect(readField(panel, 'memory')).toBe('32.1%')
    expect(readField(panel, 'disk')).toBe('66.2%')
    expect(readField(panel, 'uptime')).toBe('23h 39m')
  })
})

describe('print buttons', () => {
  it('pauses the print', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls)
    expect(panel.querySelector('button.pause-button')?.textContent?.trim()).toBe('Pause print')
    await press(panel, 'button.pause-button')
    expect(calls.paused).toBe(1)
  })

  it('resumes a paused print', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls, { printerState: { ...printingState, state: 'paused' } })
    expect(panel.querySelector('button.pause-button')?.textContent?.trim()).toBe('Resume print')
    await press(panel, 'button.pause-button')
    expect(calls.resumed).toBe(1)
  })

  it('cancels the print after a confirmation', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls)
    await press(panel, 'button.cancel-button')
    expect(calls.confirmations).toEqual(['Cancel this print?'])
    expect(calls.cancelled).toBe(1)
  })

  it('keeps printing when the cancel is not confirmed', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls, {}, false)
    await press(panel, 'button.cancel-button')
    expect(calls.cancelled).toBe(0)
  })
})

describe('extra switches', () => {
  const powerStrip: HomeAssistantSwitch = {
    key: 'power-strip',
    label: 'Power strip',
    entity_id: 'switch.feed_plug',
    state: 'on',
    requires: null,
    is_printer: false,
  }
  const raspberryPi: HomeAssistantSwitch = {
    key: 'raspberry-pi',
    label: 'Raspberry Pi',
    entity_id: 'switch.pi_outlet',
    state: 'off',
    requires: null,
    is_printer: false,
  }
  const switches: HomeAssistantSwitch[] = [powerStrip, raspberryPi]

  interface SwitchChange {
    key: string
    turnOn: boolean
  }

  async function createPanelWithSwitches(
    calls: Calls,
    options: {
      switches?: HomeAssistantSwitch[]
      isConfirmed?: boolean
      properties?: Partial<PrinterParameterPanel>
    } = {},
  ): Promise<{ panel: PrinterParameterPanel; changes: SwitchChange[] }> {
    const changes: SwitchChange[] = []
    const panel = await createPanel(
      calls,
      {
        loadSwitches: async () => options.switches ?? switches,
        changeSwitch: async (key, turnOn) => void changes.push({ key, turnOn }),
        ...options.properties,
      },
      options.isConfirmed ?? true,
    )
    await settle(panel)
    return { panel, changes }
  }

  async function settle(panel: PrinterParameterPanel): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await panel.updateComplete
  }

  function findSwitch(panel: PrinterParameterPanel, key: string): HTMLButtonElement {
    return panel.querySelector<HTMLButtonElement>(`button[data-switch="${key}"]`)!
  }

  it('shows a toggle for every configured switch, with its label and state', async () => {
    const { panel } = await createPanelWithSwitches(createCalls())
    expect(panel.querySelectorAll('button[data-switch]')).toHaveLength(2)
    expect(findSwitch(panel, 'power-strip').getAttribute('aria-label')).toBe('Power strip')
    expect(findSwitch(panel, 'power-strip').getAttribute('aria-checked')).toBe('true')
    expect(findSwitch(panel, 'raspberry-pi').getAttribute('aria-checked')).toBe('false')
  })

  it('shows no extra rows when no switch is configured', async () => {
    const { panel } = await createPanelWithSwitches(createCalls(), { switches: [] })
    expect(panel.querySelectorAll('button[data-switch]')).toHaveLength(0)
  })

  it('shows no extra rows when the switches cannot be loaded', async () => {
    const panel = await createPanel(createCalls(), {
      loadSwitches: async () => {
        throw new Error('offline')
      },
    })
    await settle(panel)
    expect(panel.querySelectorAll('button[data-switch]')).toHaveLength(0)
  })

  it('turns a switch on without asking', async () => {
    const calls = createCalls()
    const { panel, changes } = await createPanelWithSwitches(calls)
    findSwitch(panel, 'raspberry-pi').click()
    await settle(panel)
    expect(calls.confirmations).toEqual([])
    expect(changes).toEqual([{ key: 'raspberry-pi', turnOn: true }])
    expect(findSwitch(panel, 'raspberry-pi').getAttribute('aria-checked')).toBe('true')
  })

  it('asks before it turns a switch off', async () => {
    const calls = createCalls()
    const { panel, changes } = await createPanelWithSwitches(calls, {
      properties: { printerState: { ...printingState, state: 'standby' } },
    })
    findSwitch(panel, 'power-strip').click()
    await settle(panel)
    expect(calls.confirmations).toEqual(['Switch off Power strip?'])
    expect(changes).toEqual([{ key: 'power-strip', turnOn: false }])
    expect(findSwitch(panel, 'power-strip').getAttribute('aria-checked')).toBe('false')
  })

  it('warns that a print is running when a switch is turned off during one', async () => {
    const calls = createCalls()
    const { panel } = await createPanelWithSwitches(calls)
    findSwitch(panel, 'power-strip').click()
    await settle(panel)
    expect(calls.confirmations).toEqual(['A print is running. Switch off Power strip?'])
  })

  it('leaves the switch on when the question is not confirmed', async () => {
    const { panel, changes } = await createPanelWithSwitches(createCalls(), { isConfirmed: false })
    findSwitch(panel, 'power-strip').click()
    await settle(panel)
    expect(changes).toEqual([])
    expect(findSwitch(panel, 'power-strip').getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the state it showed when changing the switch fails', async () => {
    const { panel } = await createPanelWithSwitches(createCalls(), {
      properties: {
        changeSwitch: async () => {
          throw new Error('offline')
        },
      },
    })
    findSwitch(panel, 'raspberry-pi').click()
    await settle(panel)
    expect(findSwitch(panel, 'raspberry-pi').getAttribute('aria-checked')).toBe('false')
  })

  it('disables a switch that Home Assistant cannot reach', async () => {
    const { panel } = await createPanelWithSwitches(createCalls(), {
      switches: [{ ...raspberryPi, state: 'unavailable' }],
    })
    expect(findSwitch(panel, 'raspberry-pi').disabled).toBe(true)
  })

  it('reads the states again every ten seconds on its own', async () => {
    let loads = 0
    let refresh: () => void = () => undefined
    await createPanelWithSwitches(createCalls(), {
      properties: {
        repeatEvery: (callback) => {
          refresh = callback
          return () => undefined
        },
        loadSwitches: async () => {
          loads += 1
          return switches
        },
      },
    })
    expect(loads).toBe(1)
    refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(loads).toBe(2)
  })

  it('reads the states again after a switch changed', async () => {
    let loads = 0
    const { panel } = await createPanelWithSwitches(createCalls(), {
      properties: {
        waitBeforeReading: async () => undefined,
        loadSwitches: async () => {
          loads += 1
          return switches
        },
      },
    })
    findSwitch(panel, 'raspberry-pi').click()
    await settle(panel)
    await settle(panel)
    expect(loads).toBe(2)
  })
})

describe('switch order and needs', () => {
  function createSwitch(key: string, label: string, state: string, requires: string | null = null) {
    return { key, label, entity_id: `switch.${key}`, state, requires, is_printer: key === 'printer' }
  }

  const strip = createSwitch('power-strip', 'Power strip', 'on')
  const pi = createSwitch('raspberry-pi', 'Raspberry Pi', 'on', 'power-strip')
  const printer = createSwitch('printer', 'Printer', 'on', 'raspberry-pi')
  const dryer = createSwitch('filament-dryer', 'Filament dryer', 'off', 'power-strip')

  async function createPanelWith(
    calls: Calls,
    switches: HomeAssistantSwitch[],
    properties: Partial<PrinterParameterPanel> = {},
  ): Promise<{ panel: PrinterParameterPanel; changes: string[] }> {
    const changes: string[] = []
    const panel = await createPanel(calls, {
      printerState: { ...printingState, state: 'standby' },
      loadSwitches: async () => switches,
      changeSwitch: async (key, turnOn) => void changes.push(`${key} ${turnOn ? 'on' : 'off'}`),
      waitBeforeReading: () => new Promise(() => undefined),
      ...properties,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await panel.updateComplete
    return { panel, changes }
  }

  function readLabels(panel: PrinterParameterPanel): (string | null)[] {
    return [...panel.querySelectorAll('button.power-switch')].map((button) => button.getAttribute('aria-label'))
  }

  function findRow(panel: PrinterParameterPanel, label: string): HTMLElement {
    return panel.querySelector<HTMLElement>(`button.power-switch[aria-label="${label}"]`)!.closest('.parameter-row')!
  }

  function findButton(panel: PrinterParameterPanel, label: string): HTMLButtonElement {
    return panel.querySelector<HTMLButtonElement>(`button.power-switch[aria-label="${label}"]`)!
  }

  it('shows the switches in the configured order, the printer power among them', async () => {
    const { panel } = await createPanelWith(createCalls(), [strip, pi, printer, dryer])
    expect(readLabels(panel)).toEqual(['Power strip', 'Raspberry Pi', 'Printer', 'Filament dryer'])
  })

  it('puts the printer power first when the list does not hold it', async () => {
    const { panel } = await createPanelWith(createCalls(), [strip, pi])
    expect(readLabels(panel)).toEqual(['Printer power', 'Power strip', 'Raspberry Pi'])
  })

  it('locks a switch whose needed switch is off, says what it needs and shows it off', async () => {
    const { panel } = await createPanelWith(createCalls(), [
      { ...strip, state: 'off' },
      { ...pi, state: 'unavailable' },
    ])
    expect(findButton(panel, 'Raspberry Pi').disabled).toBe(true)
    expect(findButton(panel, 'Raspberry Pi').getAttribute('aria-checked')).toBe('false')
    expect(findRow(panel, 'Raspberry Pi').querySelector('.switch-need')?.textContent).toBe('needs Power strip')
    expect(findRow(panel, 'Power strip').querySelector('.switch-need')).toBeNull()
  })

  it('locks the printer power while the Pi is off', async () => {
    const { panel } = await createPanelWith(createCalls(), [strip, { ...pi, state: 'off' }, printer], {
      power: { ...power, switch: 'off' },
    })
    expect(findButton(panel, 'Printer').disabled).toBe(true)
    expect(findRow(panel, 'Printer').querySelector('.switch-need')?.textContent).toBe('needs Raspberry Pi')
  })

  it('shows the printer power as the next power event tells and switches it through the power', async () => {
    const calls = createCalls()
    const { panel, changes } = await createPanelWith(calls, [strip, pi, { ...printer, state: 'off' }])
    expect(findButton(panel, 'Printer').getAttribute('aria-checked')).toBe('false')
    panel.power = { ...power, switch: 'on' }
    await panel.updateComplete
    expect(findButton(panel, 'Printer').getAttribute('aria-checked')).toBe('true')
    findButton(panel, 'Printer').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls.confirmations).toEqual(['Switch off Printer?'])
    expect(calls.powerSwitches).toEqual([false])
    expect(changes).toEqual([])
  })

  it('names what goes off with a switch, and shows those off after', async () => {
    const calls = createCalls()
    const { panel, changes } = await createPanelWith(calls, [strip, pi, printer, dryer])
    findButton(panel, 'Power strip').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await panel.updateComplete
    expect(calls.confirmations).toEqual(['Switch off Power strip? This also switches off Printer and Raspberry Pi.'])
    expect(changes).toEqual(['power-strip off'])
    expect(readLabels(panel).map((label) => findButton(panel, label!).getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'false',
    ])
  })

  it('lists three or more with commas', async () => {
    const calls = createCalls()
    const { panel } = await createPanelWith(calls, [strip, pi, printer, { ...dryer, state: 'on' }])
    findButton(panel, 'Power strip').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls.confirmations).toEqual([
      'Switch off Power strip? This also switches off Printer, Raspberry Pi and Filament dryer.',
    ])
  })
})

describe('phone layout', () => {
  function readSectionTitles(panel: PrinterParameterPanel): (string | undefined)[] {
    return [...panel.querySelectorAll('.section-header')].map((header) => header.textContent?.trim())
  }

  it('starts with power, because that is what a phone reaches for', async () => {
    const panel = await createPanel(createCalls(), { isPhoneLayout: true })
    expect(readSectionTitles(panel)).toEqual(['Power & energy', 'Print job', 'Temperatures', 'Raspberry Pi'])
  })

  it('leaves pause and cancel to the print summary', async () => {
    const panel = await createPanel(createCalls(), { isPhoneLayout: true })
    expect(panel.querySelector('.parameter-footer')).toBeNull()
  })

  it('keeps the desktop order and buttons otherwise', async () => {
    const panel = await createPanel(createCalls())
    expect(readSectionTitles(panel)).toEqual(['Print job', 'Temperatures', 'Power & energy', 'Raspberry Pi'])
    expect(panel.querySelector('.parameter-footer')).not.toBeNull()
  })
})

describe('printer power switch', () => {
  it('warns about the running print before switching off', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls)
    await press(panel, 'button.power-switch')
    expect(calls.confirmations).toEqual(['A print is running. Switch off Printer power?'])
    expect(calls.powerSwitches).toEqual([false])
  })

  it('only asks when no print is running', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls, { printerState: { ...printingState, state: 'ready' } })
    await press(panel, 'button.power-switch')
    expect(calls.confirmations).toEqual(['Switch off Printer power?'])
  })

  it('stays on when the question is declined', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls, {}, false)
    await press(panel, 'button.power-switch')
    expect(calls.powerSwitches).toEqual([])
  })

  it('cannot be pressed when Home Assistant cannot reach it', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls, { power: { ...power, switch: 'unavailable' } })
    expect(panel.querySelector<HTMLButtonElement>('button.power-switch')!.disabled).toBe(true)
  })

  it('switches on without asking', async () => {
    const calls = createCalls()
    const panel = await createPanel(calls, { power: { ...power, switch: 'off' } })
    await press(panel, 'button.power-switch')
    expect(calls.confirmations).toEqual([])
    expect(calls.powerSwitches).toEqual([true])
  })
})

describe('auto power-off and switch descriptions', () => {
  const offAt = Date.parse('2026-10-27T15:20:00Z') / 1000
  const waiting: AutoPowerOffStatus = { enabled: true, idle_minutes: 30, off_at: offAt }
  const notWaiting: AutoPowerOffStatus = { enabled: true, idle_minutes: 30, off_at: null }

  async function settle(panel: PrinterParameterPanel): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await panel.updateComplete
  }

  async function createAutoPowerOffPanel(
    status: () => Promise<AutoPowerOffStatus>,
    properties: Partial<PrinterParameterPanel> = {},
  ): Promise<PrinterParameterPanel> {
    const panel = await createPanel(createCalls(), {
      loadSwitches: async () => [],
      loadAutoPowerOff: status,
      ...properties,
    })
    await settle(panel)
    return panel
  }

  const readLine = (panel: PrinterParameterPanel) =>
    panel.querySelector('[data-field="auto-power-off"]')?.textContent?.replace(/\s+/g, ' ').trim()

  it('says when the power goes off, under the printer power', async () => {
    const panel = await createAutoPowerOffPanel(async () => waiting)
    expect(readLine(panel)).toContain('Off at 15:20 (in 24 min)')
  })

  it('shows nothing when the power will not go off, or when the status cannot be read', async () => {
    const quiet = await createAutoPowerOffPanel(async () => notWaiting)
    expect(readLine(quiet)).toBeUndefined()
    document.body.replaceChildren()
    const unreadable = await createAutoPowerOffPanel(async () => {
      throw new Error('offline')
    })
    expect(readLine(unreadable)).toBeUndefined()
  })

  it('keeps the power on for an hour, and shows the new time', async () => {
    const postponed: number[] = []
    let status = waiting
    const panel = await createAutoPowerOffPanel(async () => status, {
      postponeAutoPowerOff: async (minutes) => {
        postponed.push(minutes)
        status = { ...waiting, off_at: offAt + 3600 }
      },
    })
    await press(panel, '[data-action="postpone-auto-power-off"]')
    await settle(panel)
    expect(postponed).toEqual([60])
    expect(readLine(panel)).toContain('Off at 16:20')
  })

  it('cancels the power-off, and the line goes away', async () => {
    let status = waiting
    let cancelled = 0
    const panel = await createAutoPowerOffPanel(async () => status, {
      cancelAutoPowerOff: async () => {
        cancelled += 1
        status = notWaiting
      },
    })
    await press(panel, '[data-action="cancel-auto-power-off"]')
    await settle(panel)
    expect(cancelled).toBe(1)
    expect(readLine(panel)).toBeUndefined()
  })

  it('puts the line under the printer power of the switch list as well', async () => {
    const printer: HomeAssistantSwitch = {
      key: 'printer-power',
      label: 'Printer power',
      entity_id: 'switch.plug',
      state: 'on',
      requires: null,
      is_printer: true,
      description: '',
    }
    const panel = await createAutoPowerOffPanel(async () => waiting, { loadSwitches: async () => [printer] })
    expect(readLine(panel)).toContain('Off at 15:20')
    expect(panel.querySelectorAll('[data-field="auto-power-off"]')).toHaveLength(1)
  })

  it('shows what a switch powers as the tooltip of its label', async () => {
    const dryer: HomeAssistantSwitch = {
      key: 'dryer',
      label: 'Dryer',
      entity_id: 'switch.dryer',
      state: 'off',
      requires: null,
      is_printer: false,
      description: 'Dries the filament',
    }
    const panel = await createAutoPowerOffPanel(async () => notWaiting, { loadSwitches: async () => [dryer] })
    const label = panel
      .querySelector<HTMLElement>('button[data-switch="dryer"]')!
      .closest('.parameter-row')!
      .querySelector<HTMLElement>('.parameter-label')!
    expect(label.title).toBe('Dries the filament')
  })
})
