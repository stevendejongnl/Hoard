import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readPublicFile(name: string): string {
  return readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8')
}

describe('brand metadata', () => {
  it('names the installed app Hoard', () => {
    const manifest = JSON.parse(readPublicFile('manifest.webmanifest'))
    expect(manifest.name).toBe('Hoard')
    expect(manifest.short_name).toBe('Hoard')
  })

  it('titles the page Hoard', () => {
    const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    expect(page).toContain('<title>Hoard</title>')
  })

  it('titles push notifications Hoard by default', () => {
    expect(readPublicFile('sw.js')).toContain("data.title || 'Hoard'")
  })
})
