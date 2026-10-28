import { describe, expect, it } from 'vitest'
import type { GcodeFile } from './types'
import { filterFiles, formatFileSize } from './file-list'

describe('file size', () => {
  it('is written in kilobytes under a megabyte', () => {
    expect(formatFileSize(2048)).toBe('2 KB')
  })

  it('is written in megabytes with one decimal from a megabyte on', () => {
    expect(formatFileSize(4_200_000)).toBe('4.0 MB')
  })

  it('is written in bytes under a kilobyte', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })
})

describe('filtering files', () => {
  const files = [{ filename: 'Blade.gcode' }, { filename: 'plate.gcode' }] as GcodeFile[]

  it('keeps files whose name has the text, ignoring case', () => {
    expect(filterFiles(files, 'BLA')).toEqual([files[0]])
  })

  it('keeps every file for empty text', () => {
    expect(filterFiles(files, '')).toEqual(files)
  })
})
