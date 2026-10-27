import { describe, expect, it } from 'vitest'
import { html, render } from 'lit'
import type { TemplateResult } from 'lit'
import { hoardMark, markVariant } from './logo'

function mount(tpl: TemplateResult): HTMLElement {
  const el = document.createElement('div')
  render(tpl, el)
  document.body.appendChild(el)
  return el
}

describe('markVariant', () => {
  it.each([16, 24, 31])('uses the stripe-free small variant at %ipx', (size) => {
    expect(markVariant(size)).toBe('small')
  })

  it.each([32, 48, 64, 256])('uses the full variant at %ipx', (size) => {
    expect(markVariant(size)).toBe('full')
  })
})

describe('hoardMark', () => {
  it('renders an svg sized by the argument with the 64 grid viewBox', () => {
    const svg = mount(hoardMark(48)).querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('width')).toBe('48')
    expect(svg?.getAttribute('height')).toBe('48')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 64 64')
  })

  it('defaults to 24px', () => {
    expect(mount(hoardMark()).querySelector('svg')?.getAttribute('width')).toBe('24')
  })

  it('is decorative by default', () => {
    const svg = mount(hoardMark(32)).querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.hasAttribute('role')).toBe(false)
    expect(svg?.hasAttribute('aria-label')).toBe(false)
  })

  it('becomes an image with an accessible name when a label is given', () => {
    const svg = mount(hoardMark(32, { label: 'Hoard' })).querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toBe('Hoard')
    expect(svg?.hasAttribute('aria-hidden')).toBe(false)
  })

  it('draws only with currentColor so the accent setting recolors it', () => {
    for (const size of [16, 64]) {
      const svg = mount(hoardMark(size)).querySelector('svg') as SVGElement
      const allowed = ['currentColor', 'none', '#fff', '#000']
      const bad = [...svg.querySelectorAll('*')].filter((n) =>
        ['fill', 'stroke'].some((a) => n.hasAttribute(a) && !allowed.includes(n.getAttribute(a) as string)),
      )
      expect(bad).toHaveLength(0)
    }
  })

  it('has layer lines (a mask with four gaps) in the full variant', () => {
    const svg = mount(hoardMark(64)).querySelector('svg') as SVGElement
    expect(svg.querySelectorAll('mask')).toHaveLength(1)
    expect(svg.querySelectorAll('mask rect[fill="#000"]')).toHaveLength(4)
  })

  it('has no layer lines in the small variant', () => {
    const svg = mount(hoardMark(16)).querySelector('svg') as SVGElement
    expect(svg.querySelectorAll('mask')).toHaveLength(0)
  })

  it('gives every full mark its own mask id so two marks never share layer lines', () => {
    const el = mount(html`${hoardMark(48)}${hoardMark(48)}`)
    const svgs = [...el.querySelectorAll('svg')]
    expect(svgs).toHaveLength(2)
    const ids = svgs.map((s) => s.querySelector('mask')?.id)
    expect(ids[0]).toBeTruthy()
    expect(ids[0]).not.toBe(ids[1])
    for (const svg of svgs) {
      const id = svg.querySelector('mask')?.id
      expect(svg.querySelector('[mask]')?.getAttribute('mask')).toBe(`url(#${id})`)
    }
  })
})
