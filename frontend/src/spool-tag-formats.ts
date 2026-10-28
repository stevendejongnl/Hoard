/** What a tag says about a spool, whichever maker's format it is in. */
export interface SpoolTagDraft {
  /** the name of the format it was read from, for the message to the person */
  format: string
  brand: string
  material: string
  color: string
  colorHexadecimal: string | null
  initialWeightGrams: number | null
  currentWeightGrams: number | null
}

/** One record of the NDEF message on a tag. Only the records with a media type are kept. */
export interface TagRecord {
  mediaType: string
  data: Uint8Array
}

/** A tag format of a filament maker: it knows its records, and reads a spool from them. */
export interface SpoolTagFormat {
  name: string
  recognises(record: TagRecord): boolean
  decode(record: TagRecord): SpoolTagDraft | null
}
