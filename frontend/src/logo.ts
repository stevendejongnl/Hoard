import { html } from 'lit'
import type { TemplateResult } from 'lit'

export type MarkVariant = 'full' | 'small'

export function markVariant(_size: number): MarkVariant {
  return 'full'
}

export function hoardMark(_size = 24, _opts: { label?: string } = {}): TemplateResult {
  return html``
}
