import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('search palette styles', () => {
  it('takes no room of its own in the top bar', () => {
    const styles = readFileSync(resolve(process.cwd(), 'src/styles/search.css'), 'utf8')
    expect(styles).toMatch(/search-modal \{[^}]*display: contents/)
  })
})
