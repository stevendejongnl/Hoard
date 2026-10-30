export interface TouchPoint {
  x: number
  y: number
}

export const PULL_THRESHOLD = 70
const PULL_RESISTANCE = 0.5
const MAXIMUM_PULL = 110
const PROTECTED_AREAS =
  '[role="dialog"], [role="alertdialog"], [class$="-overlay"], .spools-details, .appearance-popover'
const TEXT_FIELDS = 'input, textarea, select'

function isScrolledDown(target: Element, boundary: Element): boolean {
  for (let element: Element | null = target; element; element = element.parentElement) {
    if (element.scrollTop > 0) return true
    if (element === boundary) return false
  }
  return false
}

function isEditing(boundary: Element): boolean {
  return (
    boundary.querySelector('markdown-editor textarea') !== null ||
    (document.activeElement?.matches(TEXT_FIELDS) ?? false)
  )
}

/** Whether a touch here may become a pull: never over a dialog, while editing, or when it would scroll up instead. */
export function canStartPull(target: Element, boundary: Element): boolean {
  if (target.closest(PROTECTED_AREAS)) return false
  if (isEditing(boundary)) return false
  return !isScrolledDown(target, boundary)
}

/** How far the indicator has come: only for a move that is more down than sideways. */
export function measurePull(start: TouchPoint, current: TouchPoint): number {
  const down = current.y - start.y
  if (down <= 0 || Math.abs(current.x - start.x) > down) return 0
  return Math.min(down * PULL_RESISTANCE, MAXIMUM_PULL)
}

export function isPullComplete(distance: number): boolean {
  return distance >= PULL_THRESHOLD
}
