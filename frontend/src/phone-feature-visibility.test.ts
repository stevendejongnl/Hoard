import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readStyles(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'src/styles', fileName), 'utf8')
}

describe('features on phone', () => {
  it('keeps the search button in the header', () => {
    expect(readStyles('shell.css')).not.toMatch(/\.search-button,[^{]*\{\s*display: none/)
  })

  it('keeps the camera buttons on the stream', () => {
    expect(readStyles('dashboard.css')).not.toMatch(/\.camera-buttons \{\s*display: none/)
  })

  it('gives a file name in the file browser its own line', () => {
    expect(readStyles('files.css')).toMatch(
      /@media \(max-width: 800px\)[\s\S]*\.browser-browser-file-name-cell[^}]*grid-column: 1 \/ -1/,
    )
  })
})
