import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PHONE_RULE = '@media (max-width: 800px) {\n  status-bar {\n    display: none;\n  }\n}'

function readShellStyles(): string {
  return readFileSync(resolve(process.cwd(), 'src/styles/shell.css'), 'utf8')
}

describe('status bar on phone', () => {
  it('is hidden by the last rule that sets its display, so nothing later shows it again', () => {
    const styles = readShellStyles()
    const lastDisplayBlock = styles.lastIndexOf('status-bar {\n  display: block;')
    const phoneRule = styles.lastIndexOf(PHONE_RULE)
    expect(phoneRule).toBeGreaterThan(lastDisplayBlock)
  })
})
