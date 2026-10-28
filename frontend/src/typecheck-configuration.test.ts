import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// vitest's jsdom environment does not give import.meta.url the real file location, so resolve from __dirname
function frontendPath(relativePath: string): string {
  return resolve(__dirname, '..', relativePath)
}

function readJsonFile(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(frontendPath(relativePath), 'utf-8'))
}

describe('typecheck configuration', () => {
  it('keeps test files out of the production typecheck so a failing test can be committed first', () => {
    expect(readJsonFile('tsconfig.json').exclude).toContain('src/**/*.test.ts')
  })

  it('has a separate configuration that checks the tests as well', () => {
    expect(existsSync(frontendPath('tsconfig.tests.json'))).toBe(true)
    const testsConfiguration = readJsonFile('tsconfig.tests.json')
    expect(testsConfiguration.extends).toBe('./tsconfig.json')
    expect(testsConfiguration.exclude).toEqual([])
  })

  it('exposes both typechecks as npm scripts', () => {
    const scripts = readJsonFile('package.json').scripts as Record<string, string>
    expect(scripts.typecheck).toBe('tsc --noEmit')
    expect(scripts['typecheck:tests']).toBe('tsc --noEmit -p tsconfig.tests.json')
  })
})
