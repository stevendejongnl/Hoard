import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW,
  chooseFit,
  combineWithCamera,
  createSnapshotPlan,
  describeObjectFit,
  describeTransform,
  flipView,
  isQuarterTurn,
  readStoredView,
  rotateView,
  storeView,
} from './camera-view'
import type { CameraView } from './camera-view'

const straight = { rotation: 0, flip_horizontal: false, flip_vertical: false }

class FakeStorage {
  readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('camera view', () => {
  it('starts as it was: the whole picture, not turned, not flipped', () => {
    expect(DEFAULT_VIEW).toEqual({ fit: 'fit', turns: 0, flipHorizontal: false, flipVertical: false })
  })

  it('turns a quarter at a time and comes back after four', () => {
    let view: CameraView = DEFAULT_VIEW
    const turns = []
    for (let step = 0; step < 4; step += 1) {
      view = rotateView(view)
      turns.push(view.turns)
    }
    expect(turns).toEqual([1, 2, 3, 0])
  })

  it('flips one axis and flips it back', () => {
    const flipped = flipView(DEFAULT_VIEW, 'horizontal')
    expect(flipped).toMatchObject({ flipHorizontal: true, flipVertical: false })
    expect(flipView(flipped, 'horizontal')).toEqual(DEFAULT_VIEW)
    expect(flipView(DEFAULT_VIEW, 'vertical').flipVertical).toBe(true)
  })

  it('chooses how the picture fills the section', () => {
    expect(chooseFit(DEFAULT_VIEW, 'fill').fit).toBe('fill')
    expect(describeObjectFit('fit')).toBe('contain')
    expect(describeObjectFit('fill')).toBe('cover')
    expect(describeObjectFit('stretch')).toBe('fill')
  })
})

describe('the view together with the settings of the camera', () => {
  it('adds the turns of the person to the rotation of the camera, in degrees', () => {
    const combined = combineWithCamera({ ...straight, rotation: 90 }, { ...DEFAULT_VIEW, turns: 3 })
    expect(combined.rotation).toBe(0)
    expect(combineWithCamera(straight, { ...DEFAULT_VIEW, turns: 1 }).rotation).toBe(90)
  })

  it('flips back what the camera setting flips, and flips what it does not', () => {
    const view = { ...DEFAULT_VIEW, flipHorizontal: true }
    expect(combineWithCamera({ ...straight, flip_horizontal: true }, view).flipHorizontal).toBe(false)
    expect(combineWithCamera(straight, view).flipHorizontal).toBe(true)
  })

  it('describes the transform as the page applies it', () => {
    expect(describeTransform({ rotation: 90, flipHorizontal: true, flipVertical: false })).toBe(
      'scale(-1, 1) rotate(90deg)',
    )
  })

  it('knows that a quarter turn swaps the width and the height', () => {
    expect(isQuarterTurn(90)).toBe(true)
    expect(isQuarterTurn(270)).toBe(true)
    expect(isQuarterTurn(0)).toBe(false)
    expect(isQuarterTurn(180)).toBe(false)
  })
})

describe('snapshot plan', () => {
  it('keeps the size of a picture that is not turned', () => {
    const plan = createSnapshotPlan(640, 480, { rotation: 0, flipHorizontal: false, flipVertical: false })
    expect(plan).toEqual({ width: 640, height: 480, scaleX: 1, scaleY: 1, radians: 0 })
  })

  it('swaps the size for a quarter turn and carries the flips and the angle', () => {
    const plan = createSnapshotPlan(640, 480, { rotation: 90, flipHorizontal: true, flipVertical: false })
    expect(plan.width).toBe(480)
    expect(plan.height).toBe(640)
    expect(plan.scaleX).toBe(-1)
    expect(plan.radians).toBeCloseTo(Math.PI / 2)
  })
})

describe('remembering the view', () => {
  it('keeps a view for each camera in the browser and reads it back', () => {
    const storage = new FakeStorage()
    const view: CameraView = { fit: 'fill', turns: 1, flipHorizontal: true, flipVertical: false }
    storeView(storage, 'Enclosure', view)
    expect(readStoredView(storage, 'Enclosure')).toEqual(view)
    expect(readStoredView(storage, 'Nozzle')).toEqual(DEFAULT_VIEW)
  })

  it('starts from the default when nothing is kept, the text is broken or the storage fails', () => {
    const storage = new FakeStorage()
    storage.setItem('hoard.camera-views', '{not json')
    expect(readStoredView(storage, 'Enclosure')).toEqual(DEFAULT_VIEW)
    const failing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readStoredView(failing, 'Enclosure')).toEqual(DEFAULT_VIEW)
    expect(() => storeView(failing, 'Enclosure', DEFAULT_VIEW)).not.toThrow()
  })

  it('ignores kept values that are not a view', () => {
    const storage = new FakeStorage()
    storage.setItem('hoard.camera-views', JSON.stringify({ Enclosure: { fit: 'zoom', turns: 9 } }))
    expect(readStoredView(storage, 'Enclosure')).toEqual(DEFAULT_VIEW)
  })
})
