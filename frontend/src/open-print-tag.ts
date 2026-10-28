import { decodeCborItem } from './cbor'
import type { CborValue } from './cbor'
import { OPEN_PRINT_TAG_MATERIAL_TYPES } from './open-print-tag-material-types'
import type { SpoolTagDraft, SpoolTagFormat, TagRecord } from './spool-tag-formats'

/** The OpenPrintTag format of Prusa Research: https://github.com/OpenPrintTag/openprinttag-specification */
export const OPEN_PRINT_TAG_MEDIA_TYPE = 'application/vnd.openprinttag'

const MATERIAL_CLASSES: Record<number, string> = { 0: 'FFF', 1: 'SLA' }
const FILAMENT_CLASS = 'FFF'

const META_MAIN_REGION_OFFSET = 0
const META_AUXILIARY_REGION_OFFSET = 2

const MAIN_MATERIAL_CLASS = 8
const MAIN_MATERIAL_TYPE = 9
const MAIN_MATERIAL_NAME = 10
const MAIN_BRAND_NAME = 11
const MAIN_NOMINAL_WEIGHT = 16
const MAIN_ACTUAL_WEIGHT = 17
const MAIN_EMPTY_CONTAINER_WEIGHT = 18
const MAIN_PRIMARY_COLOR = 19
const MAIN_MINIMUM_PRINT_TEMPERATURE = 34
const MAIN_MAXIMUM_PRINT_TEMPERATURE = 35
const AUXILIARY_CONSUMED_WEIGHT = 0

export interface OpenPrintTagData {
  materialClass: string | null
  materialType: string | null
  materialName: string | null
  brandName: string | null
  primaryColorHexadecimal: string | null
  nominalWeightGrams: number | null
  actualWeightGrams: number | null
  emptyContainerWeightGrams: number | null
  minimumPrintTemperature: number | null
  maximumPrintTemperature: number | null
  consumedWeightGrams: number | null
}

export interface OpenPrintTagFormat extends SpoolTagFormat {
  describe(tag: OpenPrintTagData): SpoolTagDraft | null
}

type Section = Map<CborValue, CborValue>

function readNumber(section: Section, key: number): number | null {
  const value = section.get(key)
  return typeof value === 'number' ? value : null
}

function readText(section: Section, key: number): string | null {
  const value = section.get(key)
  return typeof value === 'string' ? value : null
}

function readEnumeration(section: Section, key: number, names: Record<number, string>): string | null {
  const value = readNumber(section, key)
  return value === null ? null : (names[value] ?? null)
}

function describeColor(section: Section, key: number): string | null {
  const value = section.get(key)
  if (!(value instanceof Uint8Array) || value.length < 3) return null
  const digits = [...value.slice(0, 3)].map((part) => part.toString(16).padStart(2, '0'))
  return `#${digits.join('')}`
}

function readSection(payload: Uint8Array, offset: number): Section {
  const { value } = decodeCborItem(payload, offset)
  if (!(value instanceof Map)) throw new Error('An OpenPrintTag section is a map')
  return value
}

function readOptionalSection(payload: Uint8Array, offset: number | null): Section {
  return offset === null ? new Map() : readSection(payload, offset)
}

function collectData(main: Section, auxiliary: Section): OpenPrintTagData {
  return {
    materialClass: readEnumeration(main, MAIN_MATERIAL_CLASS, MATERIAL_CLASSES),
    materialType: readEnumeration(main, MAIN_MATERIAL_TYPE, OPEN_PRINT_TAG_MATERIAL_TYPES),
    materialName: readText(main, MAIN_MATERIAL_NAME),
    brandName: readText(main, MAIN_BRAND_NAME),
    primaryColorHexadecimal: describeColor(main, MAIN_PRIMARY_COLOR),
    nominalWeightGrams: readNumber(main, MAIN_NOMINAL_WEIGHT),
    actualWeightGrams: readNumber(main, MAIN_ACTUAL_WEIGHT),
    emptyContainerWeightGrams: readNumber(main, MAIN_EMPTY_CONTAINER_WEIGHT),
    minimumPrintTemperature: readNumber(main, MAIN_MINIMUM_PRINT_TEMPERATURE),
    maximumPrintTemperature: readNumber(main, MAIN_MAXIMUM_PRINT_TEMPERATURE),
    consumedWeightGrams: readNumber(auxiliary, AUXILIARY_CONSUMED_WEIGHT),
  }
}

function parsePayload(payload: Uint8Array): OpenPrintTagData {
  const meta = decodeCborItem(payload, 0)
  if (!(meta.value instanceof Map)) throw new Error('An OpenPrintTag starts with a meta section')
  const mainOffset = readNumber(meta.value, META_MAIN_REGION_OFFSET) ?? meta.nextOffset
  const auxiliaryOffset = readNumber(meta.value, META_AUXILIARY_REGION_OFFSET)
  return collectData(readSection(payload, mainOffset), readOptionalSection(payload, auxiliaryOffset))
}

/** Reads the payload of an OpenPrintTag record (the meta, main and auxiliary sections), or null when it is not one. */
export function decodeOpenPrintTag(payload: Uint8Array): OpenPrintTagData | null {
  try {
    return parsePayload(payload)
  } catch {
    return null
  }
}

function describeColorName(tag: OpenPrintTagData): string {
  const name = tag.materialName ?? ''
  const type = tag.materialType ?? ''
  const prefix = `${type} `
  return type !== '' && name.startsWith(prefix) ? name.slice(prefix.length) : name
}

function calculateCurrentWeight(initialWeight: number | null, consumedWeight: number | null): number | null {
  if (initialWeight === null) return null
  return consumedWeight === null ? initialWeight : initialWeight - consumedWeight
}

export function createDraftFromOpenPrintTag(tag: OpenPrintTagData): SpoolTagDraft {
  const initialWeightGrams = tag.actualWeightGrams ?? tag.nominalWeightGrams
  return {
    format: 'OpenPrintTag',
    brand: tag.brandName ?? '',
    material: tag.materialType ?? '',
    color: describeColorName(tag),
    colorHexadecimal: tag.primaryColorHexadecimal,
    initialWeightGrams,
    currentWeightGrams: calculateCurrentWeight(initialWeightGrams, tag.consumedWeightGrams),
  }
}

function describe(tag: OpenPrintTagData): SpoolTagDraft | null {
  return tag.materialClass === FILAMENT_CLASS ? createDraftFromOpenPrintTag(tag) : null
}

function decode(record: TagRecord): SpoolTagDraft | null {
  const tag = decodeOpenPrintTag(record.data)
  return tag === null ? null : describe(tag)
}

export const openPrintTagFormat: OpenPrintTagFormat = {
  name: 'OpenPrintTag',
  recognises: (record) => record.mediaType === OPEN_PRINT_TAG_MEDIA_TYPE,
  decode,
  describe,
}
