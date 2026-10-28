import type { SpoolTagDraft, SpoolTagFormat, TagRecord } from './spool-tag-formats'

/** The OpenSpool format: a JSON record on an NFC tag, https://github.com/spuder/OpenSpool */
const OPEN_SPOOL_MEDIA_TYPE = 'application/json'
const OPEN_SPOOL_PROTOCOL = 'openspool'
const HEXADECIMAL_COLOR = /^#?([0-9a-f]{6})$/i

type OpenSpoolFields = Record<string, unknown>

function parseFields(record: TagRecord): OpenSpoolFields | null {
  if (record.mediaType !== OPEN_SPOOL_MEDIA_TYPE) return null
  try {
    const fields: unknown = JSON.parse(new TextDecoder().decode(record.data))
    return typeof fields === 'object' && fields !== null ? (fields as OpenSpoolFields) : null
  } catch {
    return null
  }
}

function readText(fields: OpenSpoolFields, name: string): string {
  const value = fields[name]
  return typeof value === 'string' ? value : ''
}

function describeColor(fields: OpenSpoolFields): string | null {
  const match = HEXADECIMAL_COLOR.exec(readText(fields, 'color_hex'))
  return match ? `#${match[1].toLowerCase()}` : null
}

function recognises(record: TagRecord): boolean {
  return parseFields(record)?.protocol === OPEN_SPOOL_PROTOCOL
}

function decode(record: TagRecord): SpoolTagDraft | null {
  const fields = parseFields(record)
  if (fields === null || fields.protocol !== OPEN_SPOOL_PROTOCOL) return null
  return {
    format: 'OpenSpool',
    brand: readText(fields, 'brand'),
    material: readText(fields, 'type'),
    color: '',
    colorHexadecimal: describeColor(fields),
    initialWeightGrams: null,
    currentWeightGrams: null,
  }
}

export const openSpoolFormat: SpoolTagFormat = { name: 'OpenSpool', recognises, decode }
