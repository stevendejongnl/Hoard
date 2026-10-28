import { afterEach, describe, expect, it } from 'vitest'
import type { Power, PrinterState, Spool } from '../types'
import './print-ready-modal'
import type { PrintReadyModal } from './print-ready-modal'

type Payload = { type: string; data: unknown }

const activeSpool = { id: 1, brand: 'Sunlu', material: 'PLA Plus', active: 1 } as Spool

interface Calls {
  started: string[]
  powerOns: number
  restarts: number
  events: number
}

interface Setup {
  modal: PrintReadyModal
  calls: Calls
  send: (payload: Payload) => void
}

async function createModal(
  properties: Partial<PrintReadyModal> = {},
  failures: { start?: boolean; powerOn?: boolean } = {},
): Promise<Setup> {
  const calls: Calls = { started: [], powerOns: 0, restarts: 0, events: 0 }
  let send: (payload: Payload) => void = () => undefined
  const modal = document.createElement('print-ready-modal') as PrintReadyModal
  modal.loadSpools = async () => [activeSpool]
  modal.requestStart = async (filename) => {
    calls.started.push(filename)
    if (failures.start && calls.started.length === 1) throw new Error('not ready')
  }
  modal.requestPowerOn = async () => {
    calls.powerOns += 1
    if (failures.powerOn) throw new Error('offline')
  }
  modal.requestFirmwareRestart = async () => void (calls.restarts += 1)
  modal.subscribeToPayloads = (handler) => {
    send = handler
    return () => undefined
  }
  modal.repeatEvery = () => () => undefined
  modal.addEventListener('print-started', () => (calls.events += 1))
  Object.assign(modal, properties)
  document.body.appendChild(modal)
  await modal.updateComplete
  return { modal, calls, send: (payload) => send(payload) }
}

async function settle(modal: PrintReadyModal): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await modal.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await modal.updateComplete
}

async function click(modal: PrintReadyModal, selector: string): Promise<void> {
  modal.querySelector<HTMLElement>(selector)?.click()
  await settle(modal)
}

function readText(modal: PrintReadyModal, selector: string): string {
  return modal.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('confirming a print', () => {
  it('is closed until a print is asked for', async () => {
    const { modal } = await createModal()
    expect(modal.querySelector('.ready-dialog')).toBeNull()
  })

  it('shows the file and the spool in use, and asks if the bed is clear', async () => {
    const { modal } = await createModal()
    void modal.tryPrint('blade.gcode')
    await settle(modal)
    expect(readText(modal, '.ready-file')).toBe('blade.gcode')
    expect(readText(modal, '[data-check="spool"]')).toContain('Sunlu PLA Plus')
    expect(readText(modal, '[data-check="bed"]')).toContain('Bed is clear')
  })

  it('prints nothing when cancelled', async () => {
    const { modal, calls } = await createModal()
    void modal.tryPrint('blade.gcode')
    await settle(modal)
    await click(modal, 'button.cancel-button')
    expect(calls.started).toEqual([])
    expect(modal.querySelector('.ready-dialog')).toBeNull()
  })

  it('closes with Escape and when the backdrop is pressed', async () => {
    const { modal } = await createModal()
    void modal.tryPrint('blade.gcode')
    await settle(modal)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle(modal)
    expect(modal.querySelector('.ready-dialog')).toBeNull()
    void modal.tryPrint('blade.gcode')
    await settle(modal)
    await click(modal, '.ready-overlay')
    expect(modal.querySelector('.ready-dialog')).toBeNull()
  })

  it('starts the print and reports it', async () => {
    const { modal, calls } = await createModal()
    void modal.tryPrint('blade.gcode')
    await settle(modal)
    await click(modal, 'button.start-button')
    expect(calls.started).toEqual(['blade.gcode'])
    expect(calls.events).toBe(1)
    expect(modal.querySelector('.ready-dialog')).toBeNull()
  })
})

describe('getting the printer ready', () => {
  async function openAfterFailedStart(failures = {}): Promise<Setup> {
    const setup = await createModal({}, { start: true, ...failures })
    void setup.modal.tryPrint('blade.gcode')
    await settle(setup.modal)
    await click(setup.modal, 'button.start-button')
    return setup
  }

  it('offers to switch the power on when the printer is off', async () => {
    const { modal } = await openAfterFailedStart()
    expect(readText(modal, '.ready-step')).toContain('Printer power is off')
  })

  it('switches the power on, waits, and offers a firmware restart once it is on', async () => {
    const { modal, calls, send } = await openAfterFailedStart()
    await click(modal, 'button.power-on-button')
    expect(calls.powerOns).toBe(1)
    expect(readText(modal, '.ready-step')).toContain('Waiting for the printer to start')
    send({ type: 'power', data: { watts: 5, eur_per_kwh: 0.16, switch: 'on' } as Power })
    await settle(modal)
    expect(readText(modal, '.ready-step')).toContain('Klipper is not connected')
  })

  it('starts the print when Klipper is ready after a firmware restart', async () => {
    const { modal, calls, send } = await openAfterFailedStart()
    send({ type: 'power', data: { watts: 5, eur_per_kwh: 0.16, switch: 'on' } as Power })
    await settle(modal)
    await click(modal, 'button.restart-button')
    expect(calls.restarts).toBe(1)
    send({ type: 'printer_state', data: { state: 'standby' } as PrinterState })
    await settle(modal)
    expect(calls.started).toEqual(['blade.gcode', 'blade.gcode'])
    expect(modal.querySelector('.ready-dialog')).toBeNull()
  })

  it('says so when the printer cannot be reached', async () => {
    const { modal } = await openAfterFailedStart({ powerOn: true })
    await click(modal, 'button.power-on-button')
    expect(readText(modal, '.ready-step')).toContain('Could not reach the printer')
  })
})
