import { describe, expect, it } from 'vitest'
import { decodeCbor, decodeCborItem } from './cbor'

function bytesFromHexadecimal(text: string): Uint8Array {
  const pairs = text.match(/../g) ?? []
  return Uint8Array.from(pairs.map((pair) => parseInt(pair, 16)))
}

function decodeText(text: string): unknown {
  return decodeCbor(bytesFromHexadecimal(text))
}

describe('integers', () => {
  it.each([
    ['00', 0],
    ['17', 23],
    ['1818', 24],
    ['1864', 100],
    ['1903e8', 1000],
    ['1a000f4240', 1000000],
    ['1b0000000100000000', 4294967296],
  ])('reads the unsigned integer %s as %d', (text, expected) => {
    expect(decodeText(text)).toBe(expected)
  })

  it.each([
    ['20', -1],
    ['3863', -100],
    ['3903e7', -1000],
  ])('reads the negative integer %s as %d', (text, expected) => {
    expect(decodeText(text)).toBe(expected)
  })
})

describe('floating point numbers', () => {
  it.each([
    ['f90000', 0],
    ['f93e00', 1.5],
    ['f97bff', 65504],
    ['f9c400', -4],
    ['fa47c35000', 100000],
    ['fb3ff199999999999a', 1.1],
  ])('reads %s as %d', (text, expected) => {
    expect(decodeText(text)).toBeCloseTo(expected as number, 10)
  })
})

describe('strings', () => {
  it('reads a byte string as bytes', () => {
    expect(decodeText('4401020304')).toEqual(Uint8Array.from([1, 2, 3, 4]))
  })

  it('reads a text string as UTF-8', () => {
    expect(decodeText('6449455446')).toBe('IETF')
    expect(decodeText('62c3bc')).toBe('ü')
  })
})

describe('arrays and maps', () => {
  it('reads an array', () => {
    expect(decodeText('83010203')).toEqual([1, 2, 3])
    expect(decodeText('80')).toEqual([])
  })

  it('reads an array of unknown length', () => {
    expect(decodeText('9f0102ff')).toEqual([1, 2])
  })

  it('reads a map with integer keys', () => {
    const map = decodeText('a201020304') as Map<number, number>
    expect(map.get(1)).toBe(2)
    expect(map.get(3)).toBe(4)
  })

  it('reads a map of unknown length', () => {
    const map = decodeText('bf0102ff') as Map<number, number>
    expect([...map.entries()]).toEqual([[1, 2]])
  })

  it('reads nested items', () => {
    const map = decodeText('a1018201a10203') as Map<number, unknown[]>
    expect(map.get(1)![0]).toBe(1)
    expect((map.get(1)![1] as Map<number, number>).get(2)).toBe(3)
  })
})

describe('simple values and tags', () => {
  it('reads true, false and null', () => {
    expect(decodeText('f5')).toBe(true)
    expect(decodeText('f4')).toBe(false)
    expect(decodeText('f6')).toBeNull()
  })

  it('reads a tagged value as the value', () => {
    expect(decodeText('c11a514b67b0')).toBe(1363896240)
  })
})

describe('where an item ends', () => {
  it('says where the next item starts, so sections can follow each other', () => {
    const bytes = bytesFromHexadecimal('a1010283030405')
    const first = decodeCborItem(bytes, 0)
    expect(first.nextOffset).toBe(3)
    expect(decodeCborItem(bytes, first.nextOffset).value).toEqual([3, 4, 5])
  })

  it('fails on an item that is cut off', () => {
    expect(() => decodeText('1903')).toThrow('cut off')
    expect(() => decodeText('83010203'.slice(0, 6))).toThrow('cut off')
  })
})
