import type { HomeAssistantSwitch } from './types'

/** The switch that must be on before this one may be switched on, when the list holds it. */
export function findRequiredSwitch(
  switches: HomeAssistantSwitch[],
  item: HomeAssistantSwitch,
): HomeAssistantSwitch | undefined {
  if (item.requires === null) return undefined
  return switches.find((candidate) => candidate.key === item.requires)
}

/** Every switch that needs this one, directly or through others, the deepest first. */
export function findDependentSwitches(switches: HomeAssistantSwitch[], key: string): HomeAssistantSwitch[] {
  const children = switches.filter((candidate) => candidate.requires === key)
  return children.flatMap((child) => [...findDependentSwitches(switches, child.key), child])
}

/** "A", "A and B", "A, B and C". */
export function joinLabels(labels: string[]): string {
  if (labels.length < 2) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
