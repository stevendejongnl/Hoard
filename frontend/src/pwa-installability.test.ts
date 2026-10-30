import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readPublicFile(name: string): string {
  return readFileSync(resolve(process.cwd(), 'public', name), 'utf8')
}

describe('pwa installability', () => {
  const manifest = JSON.parse(readPublicFile('manifest.webmanifest'))

  it('fetches the manifest with the session cookies, so a login in front of the app does not hide it', () => {
    const page = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    expect(page).toContain('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials" />')
  })

  it('gives the installed app a stable id inside its scope', () => {
    expect(manifest.id).toBe('/')
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true)
  })

  it('offers a 192 and a 512 icon for any purpose, next to the maskable one', () => {
    const anyIcons = manifest.icons.filter((icon: { purpose?: string }) => icon.purpose === 'any')
    expect(anyIcons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512'])
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true)
  })

  it('answers a navigation with the cached app shell when the network is gone', () => {
    const worker = readPublicFile('sw.js')
    expect(worker).toContain("request.mode === 'navigate'")
    expect(worker).toContain("caches.match('/')")
  })
})
