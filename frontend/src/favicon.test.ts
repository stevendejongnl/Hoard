import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// vitest's jsdom environment does not give import.meta.url the real file location, so resolve from __dirname
const frontend = (path: string) => resolve(__dirname, '..', path)
const read = (path: string) => readFileSync(frontend(path), 'utf-8')

describe('favicon.svg', () => {
  it('exists in public/', () => {
    expect(existsSync(frontend('public/favicon.svg'))).toBe(true)
  })

  it('is valid SVG with a viewBox, an accent tile and a glyph', () => {
    const svgDocument = new DOMParser().parseFromString(read('public/favicon.svg'), 'image/svg+xml')
    expect(svgDocument.querySelector('parsererror')).toBeNull()
    const svg = svgDocument.documentElement
    expect(svg.tagName).toBe('svg')
    expect(svg.getAttribute('viewBox')).toBeTruthy()
    expect(svgDocument.querySelector('rect[rx]')).not.toBeNull()
    expect(svgDocument.querySelectorAll('path, rect, circle').length).toBeGreaterThan(3)
  })

  it('is self-contained: no scripts, no external references', () => {
    const svg = read('public/favicon.svg')
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/href\s*=|xlink:href|url\(\s*['"]?https?:/i)
  })
})

describe('index.html', () => {
  const html = () => read('index.html')

  it('links the SVG favicon', () => {
    expect(html()).toMatch(/<link[^>]*rel="icon"[^>]*type="image\/svg\+xml"[^>]*href="\/favicon\.svg"/)
  })

  it('no longer uses the printer emoji data URI as favicon', () => {
    expect(html()).not.toContain('🖨')
    expect(html()).not.toMatch(/rel="icon"[^>]*href="data:/)
  })

  it('keeps the manifest and apple-touch-icon links', () => {
    expect(html()).toContain('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials" />')
    expect(html()).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
  })
})
