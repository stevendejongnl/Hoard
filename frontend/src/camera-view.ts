/** How a person looks at a camera: how the picture fills its section, and the turns and flips on top of the camera's own. */

export type FitMode = 'fit' | 'fill' | 'stretch'

export interface CameraView {
  fit: FitMode
  /** quarter turns clockwise, 0 to 3 */
  turns: number
  flipHorizontal: boolean
  flipVertical: boolean
}

export interface EffectiveOrientation {
  rotation: number
  flipHorizontal: boolean
  flipVertical: boolean
}

export interface CameraOrientation {
  rotation?: number
  flip_horizontal?: boolean
  flip_vertical?: boolean
}

export interface SnapshotPlan {
  width: number
  height: number
  scaleX: number
  scaleY: number
  radians: number
}

export interface ViewStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const DEFAULT_VIEW: CameraView = { fit: 'fit', turns: 0, flipHorizontal: false, flipVertical: false }

const STORAGE_KEY = 'hoard.camera-views'
const FIT_MODES: FitMode[] = ['fit', 'fill', 'stretch']
const QUARTER_TURN_DEGREES = 90
const FULL_TURN_DEGREES = 360
const TURNS_PER_ROUND = 4
const OBJECT_FIT: Record<FitMode, string> = { fit: 'contain', fill: 'cover', stretch: 'fill' }

export function rotateView(view: CameraView): CameraView {
  return { ...view, turns: (view.turns + 1) % TURNS_PER_ROUND }
}

export function flipView(view: CameraView, axis: 'horizontal' | 'vertical'): CameraView {
  if (axis === 'horizontal') return { ...view, flipHorizontal: !view.flipHorizontal }
  return { ...view, flipVertical: !view.flipVertical }
}

export function chooseFit(view: CameraView, fit: FitMode): CameraView {
  return { ...view, fit }
}

export function describeObjectFit(fit: FitMode): string {
  return OBJECT_FIT[fit]
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES
}

/** The picture the person sees: what the camera is set to, with their turns and flips on top. */
export function combineWithCamera(camera: CameraOrientation, view: CameraView): EffectiveOrientation {
  return {
    rotation: normalizeDegrees((camera.rotation ?? 0) + view.turns * QUARTER_TURN_DEGREES),
    flipHorizontal: Boolean(camera.flip_horizontal) !== view.flipHorizontal,
    flipVertical: Boolean(camera.flip_vertical) !== view.flipVertical,
  }
}

export function describeTransform(orientation: EffectiveOrientation): string {
  const horizontal = orientation.flipHorizontal ? -1 : 1
  const vertical = orientation.flipVertical ? -1 : 1
  return `scale(${horizontal}, ${vertical}) rotate(${orientation.rotation}deg)`
}

export function isQuarterTurn(rotation: number): boolean {
  return normalizeDegrees(rotation) % (QUARTER_TURN_DEGREES * 2) === QUARTER_TURN_DEGREES
}

/** Size and transform of the saved picture, the same turns and flips as on the page. */
export function createSnapshotPlan(width: number, height: number, orientation: EffectiveOrientation): SnapshotPlan {
  const isTurned = isQuarterTurn(orientation.rotation)
  return {
    width: isTurned ? height : width,
    height: isTurned ? width : height,
    scaleX: orientation.flipHorizontal ? -1 : 1,
    scaleY: orientation.flipVertical ? -1 : 1,
    radians: (orientation.rotation * Math.PI) / (QUARTER_TURN_DEGREES * 2),
  }
}

function isView(value: unknown): value is CameraView {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    FIT_MODES.includes(candidate.fit as FitMode) &&
    Number.isInteger(candidate.turns) &&
    (candidate.turns as number) >= 0 &&
    (candidate.turns as number) < TURNS_PER_ROUND &&
    typeof candidate.flipHorizontal === 'boolean' &&
    typeof candidate.flipVertical === 'boolean'
  )
}

function readAllViews(storage: ViewStorage): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** The view kept in this browser for a camera, or the default: a blocked or broken storage is not an error. */
export function readStoredView(storage: ViewStorage, cameraName: string): CameraView {
  const stored = readAllViews(storage)[cameraName]
  return isView(stored) ? stored : DEFAULT_VIEW
}

export function storeView(storage: ViewStorage, cameraName: string, view: CameraView): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...readAllViews(storage), [cameraName]: view }))
  } catch {
    // the view is not kept: it still works for as long as the page is open
  }
}
