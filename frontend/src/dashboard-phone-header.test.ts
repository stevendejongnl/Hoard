import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readShellStyles(): string {
  return readFileSync(resolve(process.cwd(), 'src/styles/shell.css'), 'utf8')
}

describe('phone header on the dashboard', () => {
  it('has a wider right edge than the other pages', () => {
    expect(readShellStyles()).toContain("top-navigation[route='/'] .top-navigation {\n    padding: 0 12px 0 16px;")
  })

  it('has a smaller emergency stop icon than the other pages', () => {
    expect(readShellStyles()).toContain(
      "top-navigation[route='/'] .top-navigation .button.emergency-stop svg {\n    width: 16px;",
    )
  })
})
