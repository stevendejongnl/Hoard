import { describe, expect, it } from 'vitest'
import { openSpoolFormat } from './open-spool'
import type { TagRecord } from './spool-tag-formats'

function createRecord(content: unknown, mediaType = 'application/json'): TagRecord {
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  return { mediaType, data: new TextEncoder().encode(text) }
}

const EXAMPLE = {
  protocol: 'openspool',
  version: '1.0',
  type: 'PLA',
  color_hex: 'FFAABB',
  brand: 'Generic',
  min_temp: '220',
  max_temp: '240',
}

describe('OpenSpool', () => {
  it('recognises a JSON record that names the openspool protocol', () => {
    expect(openSpoolFormat.recognises(createRecord(EXAMPLE))).toBe(true)
  })

  it('does not recognise JSON of another protocol, other records, or text that is not JSON', () => {
    expect(openSpoolFormat.recognises(createRecord({ protocol: 'something-else' }))).toBe(false)
    expect(openSpoolFormat.recognises(createRecord(EXAMPLE, 'text/plain'))).toBe(false)
    expect(openSpoolFormat.recognises(createRecord('not json {'))).toBe(false)
  })

  it('reads the brand, the material and the color of the spool', () => {
    expect(openSpoolFormat.decode(createRecord(EXAMPLE))).toEqual({
      format: 'OpenSpool',
      brand: 'Generic',
      material: 'PLA',
      color: '',
      colorHexadecimal: '#ffaabb',
      initialWeightGrams: null,
      currentWeightGrams: null,
    })
  })

  it('leaves the color out when it is not six hexadecimal digits', () => {
    expect(openSpoolFormat.decode(createRecord({ ...EXAMPLE, color_hex: 'pink' }))?.colorHexadecimal).toBeNull()
  })

  it('has no draft for a record that is not OpenSpool', () => {
    expect(openSpoolFormat.decode(createRecord('not json {'))).toBeNull()
  })
})
