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

describe('the spool of the selected print', () => {
  it('is laid out as one flex line, as the design draws it', () => {
    expect(readStyles('history')).toContain('.detail-value {\n  display: inline-flex;\n  align-items: center;')
  })
})

describe('details taken from the design boards', () => {
  it('draws the delete icon of the phone sheet at 20px', () => {
    expect(readStyles('spools')).toContain('.spools-details .delete-spool-button svg {\n    width: 20px;')
  })

  it('shows the placeholder of the file search in the muted text colour', () => {
    expect(readStyles('files')).toContain('.files-search::placeholder {\n  color: var(--muted-text-color);')
  })
})

describe('icons measured from the design boards', () => {
  it('draws the close icon of the phone sheet at 20px', () => {
    expect(readStyles('spools')).toContain('.close-details-button svg {\n    width: 20px;')
  })

  it('puts the search icon of the history filter 21px from the left', () => {
    expect(readStyles('history')).toMatch(/\.search-icon \{\n {2}position: absolute;\n {2}left: 21px;/)
  })
})

describe('the top bar bell', () => {
  it('takes no room while it is hidden', () => {
    expect(readStyles('shell')).toContain('push-toggle {\n  display: contents;')
  })
})
