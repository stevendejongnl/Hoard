import { afterEach, describe, expect, it } from 'vitest'
import { canStartPull, isPullComplete, measurePull, PULL_THRESHOLD } from './pull-to-refresh'

function createPage(html: string): HTMLElement {
  const boundary = document.createElement('main')
  boundary.innerHTML = html
  document.body.appendChild(boundary)
  return boundary
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('measurePull', () => {
  it('moves the indicator less than the finger', () => {
    expect(measurePull({ x: 0, y: 100 }, { x: 0, y: 200 })).toBe(50)
  })

  it('is nothing when pushing up', () => {
    expect(measurePull({ x: 0, y: 200 }, { x: 0, y: 100 })).toBe(0)
  })

  it('is nothing when the move is more sideways than down, like a row of filter chips', () => {
    expect(measurePull({ x: 0, y: 100 }, { x: 120, y: 200 })).toBe(0)
  })

  it('stops growing', () => {
    expect(measurePull({ x: 0, y: 0 }, { x: 0, y: 2000 })).toBeLessThan(200)
  })
})

describe('isPullComplete', () => {
  it('needs the threshold', () => {
    expect(isPullComplete(PULL_THRESHOLD - 1)).toBe(false)
    expect(isPullComplete(PULL_THRESHOLD)).toBe(true)
  })
})

describe('canStartPull', () => {
  it('starts at the top of a page', () => {
    const boundary = createPage('<div><button id="target"></button></div>')
    expect(canStartPull(boundary.querySelector('#target')!, boundary)).toBe(true)
  })

  it('does not start while the page itself is scrolled down', () => {
    const boundary = createPage('<button id="target"></button>')
    boundary.scrollTop = 40
    Object.defineProperty(boundary, 'scrollTop', { value: 40 })
    expect(canStartPull(boundary.querySelector('#target')!, boundary)).toBe(false)
  })

  it('does not start while a scrolling part inside the page is scrolled down', () => {
    const boundary = createPage('<div id="scroller"><button id="target"></button></div>')
    Object.defineProperty(boundary.querySelector('#scroller'), 'scrollTop', { value: 40 })
    expect(canStartPull(boundary.querySelector('#target')!, boundary)).toBe(false)
  })

  it('does not start inside a dialog or a sheet', () => {
    const boundary = createPage(
      '<div role="dialog"><button id="dialog"></button></div><aside class="spools-details"><button id="sheet"></button></aside>',
    )
    expect(canStartPull(boundary.querySelector('#dialog')!, boundary)).toBe(false)
    expect(canStartPull(boundary.querySelector('#sheet')!, boundary)).toBe(false)
  })

  it('does not start while text is being edited, because a reload would lose it', () => {
    const boundary = createPage('<textarea></textarea><button id="target"></button>')
    expect(canStartPull(boundary.querySelector('#target')!, boundary)).toBe(false)
  })

  it('does not start while a field has focus', () => {
    const boundary = createPage('<input id="field" /><button id="target"></button>')
    boundary.querySelector<HTMLInputElement>('#field')!.focus()
    expect(canStartPull(boundary.querySelector('#target')!, boundary)).toBe(false)
  })
})
