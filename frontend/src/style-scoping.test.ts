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

describe('buttons of every element', () => {
  it('reset their letter spacing, as a button element does', () => {
    expect(readStyles('components')).toContain('box-sizing: border-box;\n  letter-spacing: normal;')
  })
})

describe('empty units of the spool fields', () => {
  it('take no room on desktop and keep their gap on the phone sheet', () => {
    const styles = readStyles('spools')
    expect(styles).toContain('.spools-layout .value-unit:empty {\n  display: none;')
    expect(styles).toContain('.spools-layout .value-unit:empty {\n    display: inline;')
  })
})
