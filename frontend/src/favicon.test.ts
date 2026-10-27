import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const frontend = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const read = (path: string) => readFileSync(frontend(path), 'utf-8')

describe('favicon.svg', () => {
  it('exists in public/', () => {
    expect(existsSync(frontend('public/favicon.svg'))).toBe(true)
  })

  it('is valid SVG with a viewBox, an accent tile and a glyph', () => {
    const doc = new DOMParser().parseFromString(read('public/favicon.svg'), 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    const svg = doc.documentElement
    expect(svg.tagName).toBe('svg')
    expect(svg.getAttribute('viewBox')).toBeTruthy()
    expect(doc.querySelector('rect[rx]')).not.toBeNull()
    expect(doc.querySelectorAll('path, rect, circle').length).toBeGreaterThan(3)
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
    expect(html()).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html()).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
  })
})
