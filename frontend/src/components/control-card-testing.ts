import type { ControlCard } from './control-card'
import type { ControlStatus } from '../types'

export const IDLE_STATUS: ControlStatus = {
  state: 'standby',
  locked: false,
  position: { x: 120, y: 110, z: 24.4 },
  homed: 'xyz',
  heaters: [
    { key: 'extruder', label: 'Nozzle', temperature: 205.3, target: 210 },
    { key: 'heater_bed', label: 'Bed', temperature: 59.9, target: 60 },
  ],
  speed_percent: 100,
  flow_percent: 98,
  z_offset: -0.12,
  manual_probe: { active: false, z: null },
  fans: [
    { key: '', label: 'Part fan', percent: 50 },
    { key: 'aux', label: 'Aux fan', percent: 0 },
  ],
}

export interface SentCommand {
  route: string
  body: object
}

export interface MountOptions {
  status?: ControlStatus | null
  locked?: boolean
  failWith?: Error
}

/** A card put on the page, with what it sent to the printer written down. */
export async function mountCard<T extends ControlCard>(tag: string, options: MountOptions = {}) {
  const sent: SentCommand[] = []
  const card = document.createElement(tag) as T
  card.status = options.status === undefined ? IDLE_STATUS : options.status
  card.locked = options.locked ?? false
  card.send = async (route, body) => {
    if (options.failWith) throw options.failWith
    sent.push({ route, body })
    return { ok: true }
  }
  document.body.appendChild(card)
  await card.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { card, sent }
}

export function findButton(root: ParentNode, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()) === label,
  )
  if (!found) throw new Error(`no button "${label}"`)
  return found
}

export async function press(card: ControlCard, label: string): Promise<void> {
  findButton(card, label).click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await card.updateComplete
}

export function listButtonLabels(root: ParentNode): string[] {
  return [...root.querySelectorAll('button')].map(
    (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
  )
}
