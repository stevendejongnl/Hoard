import { describe, expect, it } from 'vitest'
import { HoldGesture } from './hold-gesture'

function createGesture() {
  const timers: { callback: () => void; milliseconds: number; cancelled: boolean }[] = []
  const completed: number[] = []
  const gesture = new HoldGesture(
    (callback, milliseconds) => {
      const timer = { callback, milliseconds, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
    1000,
    () => completed.push(completed.length),
  )
  const fire = () => timers.filter((timer) => !timer.cancelled).forEach((timer) => timer.callback())
  return { gesture, timers, completed, fire }
}

describe('holding a button', () => {
  it('is complete when the button was held for the whole time', () => {
    const { gesture, completed, fire } = createGesture()
    gesture.press()
    fire()
    expect(completed).toHaveLength(1)
    expect(gesture.isHolding).toBe(false)
  })

  it('waits the time it was given', () => {
    const { gesture, timers } = createGesture()
    gesture.press()
    expect(timers.map((timer) => timer.milliseconds)).toEqual([1000])
  })

  it('does nothing when it is let go too early', () => {
    const { gesture, completed, fire } = createGesture()
    gesture.press()
    gesture.release()
    fire()
    expect(completed).toEqual([])
    expect(gesture.isHolding).toBe(false)
  })

  it('knows it is being held between the press and the end', () => {
    const { gesture } = createGesture()
    expect(gesture.isHolding).toBe(false)
    gesture.press()
    expect(gesture.isHolding).toBe(true)
  })

  it('starts one timer however often it is pressed, as a key repeats', () => {
    const { gesture, timers } = createGesture()
    gesture.press()
    gesture.press()
    expect(timers).toHaveLength(1)
  })

  it('can be held again after it was let go', () => {
    const { gesture, completed, fire } = createGesture()
    gesture.press()
    gesture.release()
    gesture.press()
    fire()
    expect(completed).toHaveLength(1)
  })

  it('ignores a release after it was complete', () => {
    const { gesture, completed, fire } = createGesture()
    gesture.press()
    fire()
    gesture.release()
    expect(completed).toHaveLength(1)
  })
})
