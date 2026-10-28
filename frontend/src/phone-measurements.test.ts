import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readStyles(name: string): string {
  return readFileSync(resolve(process.cwd(), `src/styles/${name}.css`), 'utf8')
}

describe('phone measurements taken from the design', () => {
  it('puts the title of a page with a back link 8px after the link', () => {
    expect(readStyles('shell')).toContain('.top-navigation .has-back .phone-title {\n    margin-left: 8px;')
  })

  it('makes the file buttons of a project 36px high including their border', () => {
    expect(readStyles('project-detail')).toContain(
      '.panel-action {\n    box-sizing: border-box;\n    min-height: 36px;',
    )
  })

  it('sets the assign spool link at 12px in a history row', () => {
    expect(readStyles('history')).toContain('.history-layout .assign-spool-button {\n    font-size: 12px;')
  })
})
