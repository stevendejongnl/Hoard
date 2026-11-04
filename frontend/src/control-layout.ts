import type { IconName } from './icons'

export type CardKey =
  | 'camera'
  | 'move'
  | 'temperatures'
  | 'extruder'
  | 'tuning'
  | 'bed_mesh'
  | 'calibration'
  | 'macros'
  | 'console'
export type CardGroup = 'move' | 'heat' | 'tools'
export type GroupFilter = CardGroup | 'all'
/** What the list selects: everything, one group, or one card. */
export type CardFilter = GroupFilter | CardKey
export type Span = 1 | 2 | 3

export interface CardDefinition {
  key: CardKey
  title: string
  group: CardGroup
  icon: IconName
}

export interface ControlLayout {
  /** the cards that show, in order */
  order: CardKey[]
  /** columns a card spans; a card that is not here spans one */
  spans: Partial<Record<CardKey, Span>>
  hidden: CardKey[]
}

export const CARDS: CardDefinition[] = [
  { key: 'camera', title: 'Camera', group: 'move', icon: 'camera' },
  { key: 'move', title: 'Move and home', group: 'move', icon: 'move' },
  { key: 'temperatures', title: 'Temperatures', group: 'heat', icon: 'thermometer' },
  { key: 'extruder', title: 'Extruder', group: 'move', icon: 'extruder' },
  { key: 'tuning', title: 'Speed, flow and fans', group: 'heat', icon: 'sliders' },
  { key: 'bed_mesh', title: 'Bed mesh', group: 'tools', icon: 'grid' },
  { key: 'calibration', title: 'Calibration', group: 'tools', icon: 'crosshair' },
  { key: 'macros', title: 'Macros', group: 'tools', icon: 'play' },
  { key: 'console', title: 'Console', group: 'tools', icon: 'terminal' },
]

export const GROUPS: Array<{ filter: GroupFilter; title: string }> = [
  { filter: 'all', title: 'Everything' },
  { filter: 'move', title: 'Move' },
  { filter: 'heat', title: 'Heat' },
  { filter: 'tools', title: 'Tools' },
]

const CARD_KEYS = CARDS.map((card) => card.key)
const SPANS: Span[] = [1, 2, 3]

export const DEFAULT_LAYOUT: ControlLayout = { order: [...CARD_KEYS], spans: {}, hidden: [] }

function isCardKey(value: unknown): value is CardKey {
  return CARD_KEYS.includes(value as CardKey)
}

function isSpan(value: unknown): value is Span {
  return SPANS.includes(value as Span)
}

function readKeys(value: unknown): CardKey[] {
  return Array.isArray(value) ? value.filter(isCardKey) : []
}

function readSpans(value: unknown): ControlLayout['spans'] {
  const entries = Object.entries(value && typeof value === 'object' ? value : {})
  return Object.fromEntries(entries.filter(([key, span]) => isCardKey(key) && isSpan(span) && span !== 1))
}

function unique(keys: CardKey[]): CardKey[] {
  return [...new Set(keys)]
}

/** A layout from what the server stored: cards it does not know are dropped, new cards go after the others. */
export function normalizeLayout(stored: unknown): ControlLayout {
  if (!stored || typeof stored !== 'object') return structuredClone(DEFAULT_LAYOUT)
  const source = stored as Record<string, unknown>
  const hidden = unique(readKeys(source.hidden))
  const shown = unique([...readKeys(source.order), ...CARD_KEYS]).filter((key) => !hidden.includes(key))
  return { order: shown, spans: readSpans(source.spans), hidden }
}

export function findCard(key: CardKey): CardDefinition {
  return CARDS.find((card) => card.key === key) as CardDefinition
}

function belongsTo(key: CardKey, filter: CardFilter): boolean {
  return filter === 'all' || filter === key || findCard(key).group === filter
}

export function listVisibleCards(layout: ControlLayout, filter: CardFilter): CardKey[] {
  return layout.order.filter((key) => belongsTo(key, filter))
}

export function listHiddenCards(layout: ControlLayout): CardKey[] {
  return CARD_KEYS.filter((key) => layout.hidden.includes(key))
}

export function readSpan(layout: ControlLayout, key: CardKey): Span {
  return layout.spans[key] ?? 1
}

/** `key` goes before `target`. */
export function moveCard(layout: ControlLayout, key: CardKey, target: CardKey): ControlLayout {
  if (key === target || !layout.order.includes(key) || !layout.order.includes(target)) return layout
  const without = layout.order.filter((item) => item !== key)
  const at = without.indexOf(target)
  return { ...layout, order: [...without.slice(0, at), key, ...without.slice(at)] }
}

/** One place up or down among the cards of the filter; the cards of other groups stay where they are. */
export function shiftCard(
  layout: ControlLayout,
  key: CardKey,
  direction: -1 | 1,
  filter: CardFilter = 'all',
): ControlLayout {
  const neighbours = listVisibleCards(layout, filter)
  const neighbour = neighbours[neighbours.indexOf(key) + direction]
  if (neighbour === undefined) return layout
  const without = layout.order.filter((item) => item !== key)
  const at = without.indexOf(neighbour) + (direction === 1 ? 1 : 0)
  return { ...layout, order: [...without.slice(0, at), key, ...without.slice(at)] }
}

export function setSpan(layout: ControlLayout, key: CardKey, span: Span): ControlLayout {
  const others = Object.fromEntries(Object.entries(layout.spans).filter(([other]) => other !== key))
  return { ...layout, spans: span === 1 ? others : { ...others, [key]: span } }
}

export function hideCard(layout: ControlLayout, key: CardKey): ControlLayout {
  return { ...layout, order: layout.order.filter((item) => item !== key), hidden: unique([...layout.hidden, key]) }
}

export function showCard(layout: ControlLayout, key: CardKey): ControlLayout {
  return { ...layout, order: [...layout.order, key], hidden: layout.hidden.filter((item) => item !== key) }
}
