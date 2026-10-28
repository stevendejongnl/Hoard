import { describe, expect, it } from 'vitest'
import { readSpoolDraft } from './spool-tag-reader'
import type { SpoolTagFormat, TagRecord } from './spool-tag-formats'

function createRecord(text: string, mediaType = 'application/json'): TagRecord {
  return { mediaType, data: new TextEncoder().encode(text) }
}

function createFormat(name: string, marker: string): SpoolTagFormat {
  return {
    name,
    recognises: (record) => new TextDecoder().decode(record.data).includes(marker),
    decode: () => ({
      format: name,
      brand: name,
      material: '',
      color: '',
      colorHexadecimal: null,
      initialWeightGrams: null,
      currentWeightGrams: null,
    }),
  }
}

describe('reading a spool from the records of a tag', () => {
  it('reads an OpenSpool record', () => {
    const record = createRecord('{"protocol":"openspool","type":"PETG","brand":"eSUN","color_hex":"111827"}')
    expect(readSpoolDraft([record])?.brand).toBe('eSUN')
  })

  it('skips the records that no format knows, and takes the one that one does', () => {
    const records = [createRecord('hello', 'text/plain'), createRecord('{"protocol":"openspool","brand":"Sunlu"}')]
    expect(readSpoolDraft(records)?.brand).toBe('Sunlu')
  })

  it('gives nothing for a tag without a record that a format knows', () => {
    expect(readSpoolDraft([createRecord('hello', 'text/plain')])).toBeNull()
    expect(readSpoolDraft([])).toBeNull()
  })

  it('asks the formats it is given, in their order', () => {
    const formats = [createFormat('first', 'x'), createFormat('second', 'x')]
    expect(readSpoolDraft([createRecord('x')], formats)?.format).toBe('first')
  })

  it('goes on to the next format when one recognises a record but cannot read a spool from it', () => {
    const unreadable: SpoolTagFormat = { name: 'unreadable', recognises: () => true, decode: () => null }
    const formats = [unreadable, createFormat('second', 'x')]
    expect(readSpoolDraft([createRecord('x')], formats)?.format).toBe('second')
  })
})
