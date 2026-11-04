import { html } from 'lit'
import type { TemplateResult } from 'lit'
import type { CardKey } from './control-layout'
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
export const renderControlCard: CardRenderer = (key) => html`<section class="control-card">${key}</section>`
