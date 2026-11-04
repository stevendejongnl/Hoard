import { afterEach, describe, expect, it } from 'vitest'
import './control-move-card'
import type { ControlMoveCard } from './control-move-card'
import { findButton, listButtonLabels, mountCard, press } from './control-card-testing'

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(options = {}) {
  return mountCard<ControlMoveCard>('control-move-card', options)
}

describe('the move card', () => {
  it('has a pad for X and Y, a column for Z, the step and the home buttons', async () => {
    const { card } = await mount()
    expect(listButtonLabels(card)).toEqual([
      'Y plus',
      'X minus',
      'Home XY',
      'X plus',
      'Y minus',
      'Z up',
      'Home Z',
      'Z down',
      '0.1',
      '1',
      '10',
      '50',
      'All',
      'X',
      'Y',
      'Z',
      'Motors off',
    ])
  })

  it('shows where the head is', async () => {
    const { card } = await mount()
    expect(card.textContent).toContain('X 120.0')
    expect(card.textContent).toContain('Y 110.0')
    expect(card.textContent).toContain('Z 24.40')
  })

  it('moves by the chosen step, ten millimetres to begin with', async () => {
    const { card, sent } = await mount()
    await press(card, 'X plus')
    await press(card, 'Y minus')
    expect(sent).toEqual([
      { route: 'move', body: { axis: 'x', distance: 10 } },
      { route: 'move', body: { axis: 'y', distance: -10 } },
    ])
  })

  it('moves by another step when it is chosen, and marks the chosen one', async () => {
    const { card, sent } = await mount()
    await press(card, '0.1')
    expect(findButton(card, '0.1').getAttribute('aria-pressed')).toBe('true')
    expect(findButton(card, '10').getAttribute('aria-pressed')).toBe('false')
    await press(card, 'X minus')
    expect(sent).toEqual([{ route: 'move', body: { axis: 'x', distance: -0.1 } }])
  })

  it('moves Z slowly', async () => {
    const { card, sent } = await mount()
    await press(card, 'Z up')
    await press(card, 'Z down')
    expect(sent).toEqual([
      { route: 'move', body: { axis: 'z', distance: 10, speed: 600 } },
      { route: 'move', body: { axis: 'z', distance: -10, speed: 600 } },
    ])
  })

  it('homes the axes that are asked for', async () => {
    const { card, sent } = await mount()
    await press(card, 'Home XY')
    await press(card, 'Home Z')
    await press(card, 'All')
    await press(card, 'X')
    expect(sent.map((command) => command.body)).toEqual([{ axes: ['x', 'y'] }, { axes: ['z'] }, {}, { axes: ['x'] }])
    expect(sent.every((command) => command.route === 'home')).toBe(true)
  })

  it('switches the motors off with the G-code for it', async () => {
    const { card, sent } = await mount()
    await press(card, 'Motors off')
    expect(sent).toEqual([{ route: 'gcode', body: { script: 'M84' } }])
  })

  it('has every button that moves locked while printing, and sends nothing', async () => {
    const { card, sent } = await mount({ locked: true })
    const movers = [...card.querySelectorAll('button:not(.control-chip)')] as HTMLButtonElement[]
    expect(movers.every((button) => button.disabled)).toBe(true)
    await press(card, 'X plus')
    expect(sent).toEqual([])
    expect(card.textContent).toContain('Locked while the printer is printing')
  })

  it('shows what the printer said when it refuses', async () => {
    const { card } = await mount({ failWith: new Error('x') })
    await press(card, 'Z up')
    expect(card.querySelector('.control-card-failure')).not.toBeNull()
  })
})
