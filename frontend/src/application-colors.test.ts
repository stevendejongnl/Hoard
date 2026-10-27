import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CHROME_COLOR = '#232326'

// vitest's jsdom environment does not give import.meta.url the real file location, so resolve from __dirname
function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(__dirname, '..', relativePath), 'utf-8')
}

describe('application colors', () => {
  it('colors the browser bar with the chrome color of the design', () => {
    expect(readFrontendFile('index.html')).toContain(`<meta name="theme-color" content="${CHROME_COLOR}" />`)
  })

  it('uses the chrome color for the installed app theme and splash background', () => {
    const manifest = JSON.parse(readFrontendFile('public/manifest.webmanifest'))
    expect(manifest.theme_color).toBe(CHROME_COLOR)
    expect(manifest.background_color).toBe(CHROME_COLOR)
  })

  it('defines the chrome color token with the same value', () => {
    expect(readFrontendFile('src/styles/design-tokens.css')).toContain(`--chrome-color: ${CHROME_COLOR};`)
  })
})
