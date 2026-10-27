import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readPhoneStyles(): string {
  const styles = readFileSync(resolve(process.cwd(), 'src/styles/spools.css'), 'utf8')
  return styles.slice(styles.indexOf('@media (max-width: 800px)'))
}

describe('spool edit sheet styles on a phone', () => {
  it('sticks to the bottom of the screen instead of covering all of it', () => {
    const rule = readPhoneStyles().match(/\.spools-details\.open \{[^}]*\}/)?.[0] ?? ''
    expect(rule).toContain('bottom: 0')
    expect(rule).not.toContain('inset: 0')
  })

  it('has a rounded top and a drag handle', () => {
    const styles = readPhoneStyles()
    expect(styles).toContain('.spools-details.open::before')
    expect(styles).toMatch(/\.spools-details\.open \{[^}]*border-radius: 8px 8px 0 0/)
  })

  it('dims the list behind the sheet', () => {
    expect(readPhoneStyles()).toMatch(/\.sheet-backdrop \{[^}]*position: fixed/)
  })
})
