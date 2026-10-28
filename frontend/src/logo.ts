import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { unsafeSVG } from 'lit/directives/unsafe-svg.js'

/**
 * The Hoard mark: a nozzle printing into a crate. Drawn on a 64 grid, one color (currentColor).
 * Two variants: the full mark has layer lines cut into the cube and ball; below 32px those
 * lines blur, so a chunkier stripe-free variant is used.
 */
export type MarkVariant = 'full' | 'small'

/** Below this size the layer lines turn to haze, so the small variant is used. */
const FULL_MIN_SIZE = 32

export function markVariant(size: number): MarkVariant {
  return size < FULL_MIN_SIZE ? 'small' : 'full'
}

/** Layer lines are gaps cut by a mask; each full mark needs its own mask id. */
let maskSeq = 0

const layerGaps = [33.2, 37.4, 41.6, 45.8]
  .map((y) => `<rect x="0" y="${y}" width="64" height="1.7" fill="#000"/>`)
  .join('')

function fullMark(maskId: string): string {
  return (
    `<defs><mask id="${maskId}"><rect width="64" height="64" fill="#fff"/>${layerGaps}</mask></defs>` +
    '<path d="M13.75 4h16v8l-5 8h-6l-5-8z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
    `<g mask="url(#${maskId})" fill="currentColor"><rect x="11.5" y="28" width="20.5" height="20" rx="3"/><circle cx="44" cy="39" r="9"/></g>` +
    '<path d="M3 51h58v3a7 7 0 0 1-7 7H10a7 7 0 0 1-7-7z" fill="currentColor"/>' +
    '<rect x="3" y="40" width="5.5" height="14" rx="2.5" fill="currentColor"/>' +
    '<rect x="55.5" y="40" width="5.5" height="14" rx="2.5" fill="currentColor"/>'
  )
}

const SMALL_MARK =
  '<path d="M13 3h18v9l-6 9h-6l-6-9z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
  '<rect x="12" y="27" width="21" height="21" rx="4" fill="currentColor"/>' +
  '<circle cx="44.5" cy="38.5" r="9.5" fill="currentColor"/>' +
  '<path d="M2 51h60v3a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8z" fill="currentColor"/>' +
  '<rect x="2" y="39" width="7" height="15" rx="3" fill="currentColor"/>' +
  '<rect x="55" y="39" width="7" height="15" rx="3" fill="currentColor"/>'

/** Decorative by default; pass a label when the mark is the only thing naming the control. */
export function hoardMark(size = 24, options: { label?: string } = {}): TemplateResult {
  const body = markVariant(size) === 'full' ? fullMark(`hoard-mark-${++maskSeq}`) : SMALL_MARK
  return options.label
    ? html`<svg
        width=${size}
        height=${size}
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label=${options.label}
        style="flex: none"
      >
        ${unsafeSVG(body)}
      </svg>`
    : html`<svg width=${size} height=${size} viewBox="0 0 64 64" fill="none" aria-hidden="true" style="flex: none">
        ${unsafeSVG(body)}
      </svg>`
}
