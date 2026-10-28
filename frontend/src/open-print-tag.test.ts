import { describe, expect, it } from 'vitest'
import { createDraftFromOpenPrintTag, decodeOpenPrintTag, openPrintTagFormat } from './open-print-tag'

/**
 * The payload of the sample tag in the OpenPrintTag specification (MIT license,
 * https://github.com/OpenPrintTag/openprinttag-specification, docs_src/sample_data), without the
 * NFC and NDEF framing: the meta section, the main section and the auxiliary section.
 */
const SAMPLE_PAYLOAD_HEXADECIMAL =
  'a10218e2bf0050473bb8cde12945b89fcfda1c3add9c47076131080009000a70504c412047616c61787920426c61636b' +
  '0b6950727573616d656e740e1a67acb31a101903e8111903f412186413433d3e3d181bf93266181c9f17ff182218cd18' +
  '2318dc182418aa182518281826183c18281828182914182a184bff000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000' +
  '000000000000000000000000000000000000000000'

function bytesFromHexadecimal(text: string): Uint8Array {
  const pairs = text.match(/../g) ?? []
  return Uint8Array.from(pairs.map((pair) => parseInt(pair, 16)))
}

const SAMPLE_PAYLOAD = bytesFromHexadecimal(SAMPLE_PAYLOAD_HEXADECIMAL)

describe('the sample tag of the specification', () => {
  it('has the material, the brand and the color', () => {
    const tag = decodeOpenPrintTag(SAMPLE_PAYLOAD)
    expect(tag?.brandName).toBe('Prusament')
    expect(tag?.materialName).toBe('PLA Galaxy Black')
    expect(tag?.materialType).toBe('PLA')
    expect(tag?.primaryColorHexadecimal).toBe('#3d3e3d')
  })

  it('has the weights and the print temperatures', () => {
    const tag = decodeOpenPrintTag(SAMPLE_PAYLOAD)
    expect(tag?.nominalWeightGrams).toBe(1000)
    expect(tag?.actualWeightGrams).toBe(1012)
    expect(tag?.emptyContainerWeightGrams).toBe(100)
    expect(tag?.minimumPrintTemperature).toBe(205)
    expect(tag?.maximumPrintTemperature).toBe(220)
  })

  it('is a filament and has used nothing yet', () => {
    const tag = decodeOpenPrintTag(SAMPLE_PAYLOAD)
    expect(tag?.materialClass).toBe('FFF')
    expect(tag?.consumedWeightGrams).toBeNull()
  })
})

describe('reading a tag', () => {
  it('skips a key that it does not know, as the specification demands', () => {
    const payload = bytesFromHexadecimal('a0bf08000b6950727573616d656e74186401ff')
    expect(decodeOpenPrintTag(payload)?.brandName).toBe('Prusament')
  })

  it('says a payload that is not an OpenPrintTag is not one', () => {
    expect(decodeOpenPrintTag(new Uint8Array())).toBeNull()
    expect(decodeOpenPrintTag(bytesFromHexadecimal('ffff'))).toBeNull()
    expect(decodeOpenPrintTag(bytesFromHexadecimal('83010203'))).toBeNull()
  })
})

describe('the spool that a tag describes', () => {
  it('takes the brand, the material, the color and the weight from the tag', () => {
    const draft = openPrintTagFormat.decode({ mediaType: 'application/vnd.openprinttag', data: SAMPLE_PAYLOAD })
    expect(draft).toEqual({
      format: 'OpenPrintTag',
      brand: 'Prusament',
      material: 'PLA',
      color: 'Galaxy Black',
      colorHexadecimal: '#3d3e3d',
      initialWeightGrams: 1012,
      currentWeightGrams: 1012,
    })
  })

  it('takes what was used from the weight that is left', () => {
    const tag = decodeOpenPrintTag(SAMPLE_PAYLOAD)!
    expect(createDraftFromOpenPrintTag({ ...tag, consumedWeightGrams: 200 }).currentWeightGrams).toBe(812)
  })

  it('keeps the whole material name as the color when it does not start with the material type', () => {
    const tag = decodeOpenPrintTag(SAMPLE_PAYLOAD)!
    expect(createDraftFromOpenPrintTag({ ...tag, materialName: 'Galaxy Black' }).color).toBe('Galaxy Black')
  })

  it('has no draft for a resin', () => {
    const tag = decodeOpenPrintTag(SAMPLE_PAYLOAD)!
    expect(openPrintTagFormat.describe({ ...tag, materialClass: 'SLA' })).toBeNull()
  })

  it('recognises its own media type and no other', () => {
    expect(openPrintTagFormat.recognises({ mediaType: 'application/vnd.openprinttag', data: new Uint8Array() })).toBe(
      true,
    )
    expect(openPrintTagFormat.recognises({ mediaType: 'application/json', data: new Uint8Array() })).toBe(false)
  })
})
