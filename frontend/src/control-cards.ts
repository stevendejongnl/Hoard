import { html } from 'lit'
import type { TemplateResult } from 'lit'
import type { CardKey } from './control-layout'
import './components/control-camera-card'
import './components/control-extruder-card'
import './components/control-move-card'
import './components/control-temperatures-card'
import type { ControlStatus } from './types'

/** What a card needs from the page. */
export interface CardContext {
  status: ControlStatus | null
  /** true while the printer prints, and when the printer cannot be reached */
  locked: boolean
  /** read the status again, because a command was sent */
  refresh: () => void
}

export type CardRenderer = (key: CardKey, context: CardContext) => TemplateResult

/** The element of a card, with what the page knows. */
export const renderControlCard: CardRenderer = (key, context) => {
  switch (key) {
    case 'camera':
      return html`<control-camera-card .status=${context.status} ?locked=${context.locked}></control-camera-card>`
    case 'move':
      return html`<control-move-card .status=${context.status} ?locked=${context.locked}></control-move-card>`
    case 'temperatures':
      return html`<control-temperatures-card
        .status=${context.status}
        ?locked=${context.locked}
      ></control-temperatures-card>`
    case 'extruder':
      return html`<control-extruder-card .status=${context.status} ?locked=${context.locked}></control-extruder-card>`
    default:
      return html`<section class="control-card">${key}</section>`
  }
}
