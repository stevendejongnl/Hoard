import { describe, expect, it } from 'vitest'
import {
  CARDS,
  DEFAULT_LAYOUT,
  hideCard,
  listHiddenCards,
  listVisibleCards,
  moveCard,
  normalizeLayout,
  readSpan,
  setSpan,
  shiftCard,
  showCard,
} from './control-layout'
import type { ControlLayout } from './control-layout'

const ALL = ['camera', 'move', 'temperatures', 'extruder', 'tuning', 'bed_mesh', 'calibration', 'macros', 'console']

function layoutOf(order: string[], hidden: string[] = [], spans: Record<string, number> = {}): ControlLayout {
  return { order, hidden, spans } as ControlLayout
}

describe('the cards of the control page', () => {
  it('are nine, each in a group', () => {
    expect(CARDS.map((card) => card.key)).toEqual(ALL)
    expect(CARDS.map((card) => card.group)).toEqual([
      'move',
      'move',
      'heat',
      'move',
      'heat',
      'tools',
      'tools',
      'tools',
      'tools',
    ])
  })

  it('start as the design has them: the camera and the bed mesh two columns wide, the rest one', () => {
    expect(DEFAULT_LAYOUT).toEqual({
      order: ['camera', 'temperatures', 'move', 'extruder', 'tuning', 'bed_mesh', 'calibration', 'macros', 'console'],
      spans: { camera: 2, bed_mesh: 2 },
      hidden: [],
    })
  })
})

describe('reading a stored layout', () => {
  it('gives the default when nothing was stored', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(normalizeLayout('nonsense')).toEqual(DEFAULT_LAYOUT)
  })

  it('keeps the order that was stored and puts cards it does not know about after it', () => {
    const layout = normalizeLayout(layoutOf(['console', 'camera']))
    expect(layout.order).toEqual(['console', 'camera', ...ALL.filter((key) => key !== 'console' && key !== 'camera')])
  })

  it('drops cards that no longer exist', () => {
    const layout = normalizeLayout(layoutOf(['gone', 'move'], ['also-gone'], { gone: 2 }))
    expect(layout.order[0]).toBe('move')
    expect(layout.hidden).toEqual([])
    expect(layout.spans).toEqual({})
  })

  it('keeps hidden cards out of the order', () => {
    const layout = normalizeLayout(layoutOf(['move', 'camera'], ['camera']))
    expect(layout.order).not.toContain('camera')
    expect(layout.hidden).toEqual(['camera'])
  })

  it('ignores a span that is not 1, 2 or 3', () => {
    const layout = normalizeLayout(layoutOf(ALL, [], { move: 2, camera: 7, console: 0 }))
    expect(layout.spans).toEqual({ move: 2 })
  })
})

describe('listing the cards', () => {
  it('shows every card that is not hidden, in order', () => {
    const layout = layoutOf(['move', 'camera', 'console'], ['macros'])
    expect(listVisibleCards(layout, 'all')).toEqual(['move', 'camera', 'console'])
  })

  it('shows one group, in the order of the layout', () => {
    const layout = layoutOf(['console', 'camera', 'macros', 'move'])
    expect(listVisibleCards(layout, 'tools')).toEqual(['console', 'macros'])
    expect(listVisibleCards(layout, 'move')).toEqual(['camera', 'move'])
  })

  it('shows one card on its own', () => {
    const layout = layoutOf(['console', 'camera', 'macros', 'move'])
    expect(listVisibleCards(layout, 'macros')).toEqual(['macros'])
    expect(listVisibleCards(layout, 'bed_mesh')).toEqual([])
  })

  it('lists the hidden cards in the order of the list, not of the layout', () => {
    expect(listHiddenCards(layoutOf(['move'], ['console', 'camera']))).toEqual(['camera', 'console'])
  })
})

describe('changing the layout', () => {
  it('moves a card before another one', () => {
    expect(moveCard(layoutOf(['camera', 'move', 'temperatures', 'extruder']), 'extruder', 'move').order).toEqual([
      'camera',
      'extruder',
      'move',
      'temperatures',
    ])
    expect(moveCard(layoutOf(['camera', 'move', 'temperatures', 'extruder']), 'camera', 'temperatures').order).toEqual([
      'move',
      'camera',
      'temperatures',
      'extruder',
    ])
  })

  it('leaves the layout as it is when a card is dropped on itself or on a card that is not there', () => {
    const layout = layoutOf(['camera', 'move'])
    expect(moveCard(layout, 'camera', 'camera')).toEqual(layout)
    expect(moveCard(layout, 'camera', 'zzz')).toEqual(layout)
  })

  it('moves a card one place up or down, and stops at the ends', () => {
    const layout = layoutOf(['camera', 'move', 'temperatures'])
    expect(shiftCard(layout, 'move', -1).order).toEqual(['move', 'camera', 'temperatures'])
    expect(shiftCard(layout, 'move', 1).order).toEqual(['camera', 'temperatures', 'move'])
    expect(shiftCard(layout, 'camera', -1).order).toEqual(['camera', 'move', 'temperatures'])
    expect(shiftCard(layout, 'temperatures', 1).order).toEqual(['camera', 'move', 'temperatures'])
  })

  it('moves a card past the cards of another group that the filter hides', () => {
    const layout = layoutOf(['camera', 'macros', 'move'])
    expect(shiftCard(layout, 'camera', 1, 'move').order).toEqual(['macros', 'move', 'camera'])
  })

  it('sets the span of a card, and one column is the same as none', () => {
    expect(setSpan(layoutOf(['camera']), 'camera', 3).spans).toEqual({ a: 3 })
    expect(setSpan(layoutOf(['camera'], [], { a: 3 }), 'camera', 1).spans).toEqual({})
    expect(readSpan(layoutOf(['camera'], [], { a: 2 }), 'camera')).toBe(2)
    expect(readSpan(layoutOf(['camera']), 'camera')).toBe(1)
  })

  it('hides a card, takes it out of the order, and shows it again at the end', () => {
    const hidden = hideCard(layoutOf(['camera', 'move', 'temperatures']), 'move')
    expect(hidden).toEqual(layoutOf(['camera', 'temperatures'], ['move']))
    expect(showCard(hidden, 'move')).toEqual(layoutOf(['camera', 'temperatures', 'move']))
  })

  it('does not change the layout it was given', () => {
    const layout = layoutOf(['camera', 'move'])
    hideCard(layout, 'camera')
    moveCard(layout, 'move', 'camera')
    setSpan(layout, 'camera', 2)
    expect(layout).toEqual(layoutOf(['camera', 'move']))
  })
})
