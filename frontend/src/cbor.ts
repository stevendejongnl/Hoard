/** A small reader for CBOR (RFC 8949), enough for the data on NFC tags: no writing, no chunked strings. */

export type CborValue =
  | number
  | boolean
  | string
  | null
  | undefined
  | Uint8Array
  | CborValue[]
  | Map<CborValue, CborValue>

export interface CborItem {
  value: CborValue
  /** where the byte after this item is, so that items can follow each other */
  nextOffset: number
}

interface Result extends CborItem {
  isBreak?: boolean
}

interface Argument {
  /** null for an item of unknown length */
  argument: number | null
  nextOffset: number
}

type MajorReader = (bytes: Uint8Array, offset: number, argument: number | null) => Result

const BREAK_BYTE = 0xff
const UNKNOWN_LENGTH = 31
const MAJOR_TYPE_SHIFT = 5
const ADDITIONAL_INFORMATION_MASK = 31
const SIMPLE_MAJOR_TYPE = 7

function requireBytes(bytes: Uint8Array, offset: number, count: number): void {
  if (offset + count > bytes.length) throw new Error('CBOR item is cut off')
}

function createView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function readUnsigned(bytes: Uint8Array, offset: number, size: number): number {
  requireBytes(bytes, offset, size)
  const view = createView(bytes)
  if (size === 1) return view.getUint8(offset)
  if (size === 2) return view.getUint16(offset)
  if (size === 4) return view.getUint32(offset)
  return Number(view.getBigUint64(offset))
}

function readArgument(bytes: Uint8Array, offset: number, additionalInformation: number): Argument {
  if (additionalInformation < 24) return { argument: additionalInformation, nextOffset: offset }
  if (additionalInformation === UNKNOWN_LENGTH) return { argument: null, nextOffset: offset }
  if (additionalInformation > 27) throw new Error('CBOR item has an unsupported length')
  const size = 2 ** (additionalInformation - 24)
  return { argument: readUnsigned(bytes, offset, size), nextOffset: offset + size }
}

function requireArgument(argument: number | null): number {
  if (argument === null) throw new Error('CBOR strings of unknown length are not supported')
  return argument
}

function decodeHalfFloat(bits: number): number {
  const sign = bits >> 15 ? -1 : 1
  const exponent = (bits >> 10) & 31
  const fraction = bits & 1023
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024)
  if (exponent === 31) return fraction ? NaN : sign * Infinity
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024)
}

function readFloat(bytes: Uint8Array, offset: number, size: number): Result {
  requireBytes(bytes, offset, size)
  const view = createView(bytes)
  const value =
    size === 2
      ? decodeHalfFloat(view.getUint16(offset))
      : size === 4
        ? view.getFloat32(offset)
        : view.getFloat64(offset)
  return { value, nextOffset: offset + size }
}

function readSimple(bytes: Uint8Array, offset: number, additionalInformation: number): Result {
  const constants: Record<number, CborValue> = { 20: false, 21: true, 22: null, 23: undefined }
  if (additionalInformation in constants) return { value: constants[additionalInformation], nextOffset: offset }
  if (additionalInformation >= 25 && additionalInformation <= 27) {
    return readFloat(bytes, offset, 2 ** (additionalInformation - 24))
  }
  throw new Error('CBOR simple value is not supported')
}

function readItems(bytes: Uint8Array, offset: number, argument: number | null, itemsPerEntry: number) {
  const items: CborValue[] = []
  const wanted = argument === null ? Infinity : argument * itemsPerEntry
  let position = offset
  while (items.length < wanted) {
    const result = decodeAny(bytes, position)
    position = result.nextOffset
    if (result.isBreak) break
    items.push(result.value)
  }
  return { items, nextOffset: position }
}

function readArray(bytes: Uint8Array, offset: number, argument: number | null): Result {
  const { items, nextOffset } = readItems(bytes, offset, argument, 1)
  return { value: items, nextOffset }
}

function readMap(bytes: Uint8Array, offset: number, argument: number | null): Result {
  const { items, nextOffset } = readItems(bytes, offset, argument, 2)
  const map = new Map<CborValue, CborValue>()
  for (let index = 0; index + 1 < items.length; index += 2) map.set(items[index], items[index + 1])
  return { value: map, nextOffset }
}

function readByteString(bytes: Uint8Array, offset: number, argument: number | null): Result {
  const length = requireArgument(argument)
  requireBytes(bytes, offset, length)
  return { value: bytes.slice(offset, offset + length), nextOffset: offset + length }
}

function readTextString(bytes: Uint8Array, offset: number, argument: number | null): Result {
  const length = requireArgument(argument)
  requireBytes(bytes, offset, length)
  return { value: new TextDecoder().decode(bytes.subarray(offset, offset + length)), nextOffset: offset + length }
}

function readTagged(bytes: Uint8Array, offset: number): Result {
  return decodeAny(bytes, offset)
}

const MAJOR_READERS: Record<number, MajorReader> = {
  0: (_bytes, offset, argument) => ({ value: requireArgument(argument), nextOffset: offset }),
  1: (_bytes, offset, argument) => ({ value: -1 - requireArgument(argument), nextOffset: offset }),
  2: readByteString,
  3: readTextString,
  4: readArray,
  5: readMap,
  6: readTagged,
}

function decodeAny(bytes: Uint8Array, offset: number): Result {
  requireBytes(bytes, offset, 1)
  const initial = bytes[offset]
  if (initial === BREAK_BYTE) return { value: undefined, nextOffset: offset + 1, isBreak: true }
  const majorType = initial >> MAJOR_TYPE_SHIFT
  const additionalInformation = initial & ADDITIONAL_INFORMATION_MASK
  if (majorType === SIMPLE_MAJOR_TYPE) return readSimple(bytes, offset + 1, additionalInformation)
  const { argument, nextOffset } = readArgument(bytes, offset + 1, additionalInformation)
  return MAJOR_READERS[majorType](bytes, nextOffset, argument)
}

/** Reads the item that starts at the offset, and says where the next one starts. */
export function decodeCborItem(bytes: Uint8Array, offset: number): CborItem {
  const result = decodeAny(bytes, offset)
  if (result.isBreak) throw new Error('CBOR break outside an item of unknown length')
  return { value: result.value, nextOffset: result.nextOffset }
}

/** Reads the first item of the bytes. */
export function decodeCbor(bytes: Uint8Array): CborValue {
  return decodeCborItem(bytes, 0).value
}
