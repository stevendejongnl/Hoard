import { describe, expect, it } from 'vitest'
import { render } from 'lit'
import { ICON_NAMES, renderIcon } from './icons'

function renderIntoElement(template: ReturnType<typeof renderIcon>): HTMLElement {
  const element = document.createElement('div')
  render(template, element)
  return element
}

describe('renderIcon', () => {
  it.each(ICON_NAMES)('draws the %s icon with at least one shape', (name) => {
    const shapes = renderIntoElement(renderIcon(name)).querySelectorAll('path, rect, circle')
    expect(shapes.length).toBeGreaterThan(0)
  })

  it('has the icons the design uses', () => {
    expect(ICON_NAMES).toEqual(
      expect.arrayContaining([
        'dashboard',
        'history',
        'projects',
        'spools',
        'search',
        'emergency-stop',
        'chevron-down',
      ]),
    )
  })

  it('is decorative: hidden from screen readers', () => {
    const svg = renderIntoElement(renderIcon('search')).querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.hasAttribute('role')).toBe(false)
  })

  it('is 16 pixels with a stroke width of 2 by default', () => {
    const svg = renderIntoElement(renderIcon('search')).querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('height')).toBe('16')
    expect(svg?.getAttribute('stroke-width')).toBe('2')
  })

  it('takes a size and a stroke width', () => {
    const svg = renderIntoElement(renderIcon('search', 22, 1.5)).querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('22')
    expect(svg?.getAttribute('stroke-width')).toBe('1.5')
  })

  it('follows the text color', () => {
    const svg = renderIntoElement(renderIcon('search')).querySelector('svg')
    expect(svg?.getAttribute('stroke')).toBe('currentColor')
    expect(svg?.getAttribute('fill')).toBe('none')
  })
})
