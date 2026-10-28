import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readStyles(name: string): string {
  return readFileSync(resolve(process.cwd(), `src/styles/${name}.css`), 'utf8')
}

describe('page styles stay on their page', () => {
  it('right-aligns inputs only inside the spools page', () => {
    expect(readStyles('spools')).not.toMatch(/^\.value-field/m)
    expect(readStyles('spools')).toContain('.spools-layout .value-field input {')
  })

  it('sizes every button with its border, as a button element does', () => {
    expect(readStyles('components')).toContain('.button {\n  box-sizing: border-box;')
  })
})

describe('the history search field stays on the history page', () => {
  it('has no search field rule outside the history layout', () => {
    expect(readStyles('history')).not.toMatch(/^\s*\.search-field/m)
  })
})
