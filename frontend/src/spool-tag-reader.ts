import { openPrintTagFormat } from './open-print-tag'
import { openSpoolFormat } from './open-spool'
import type { SpoolTagDraft, SpoolTagFormat, TagRecord } from './spool-tag-formats'

/** The tag formats that Hoard reads, in the order they are tried. */
export const SPOOL_TAG_FORMATS: SpoolTagFormat[] = [openPrintTagFormat, openSpoolFormat]

function readRecord(record: TagRecord, formats: SpoolTagFormat[]): SpoolTagDraft | null {
  for (const format of formats) {
    const draft = format.recognises(record) ? format.decode(record) : null
    if (draft !== null) return draft
  }
  return null
}

/** The spool that the first record with a known format describes, or null when no record has one. */
export function readSpoolDraft(
  records: TagRecord[],
  formats: SpoolTagFormat[] = SPOOL_TAG_FORMATS,
): SpoolTagDraft | null {
  for (const record of records) {
    const draft = readRecord(record, formats)
    if (draft !== null) return draft
  }
  return null
}
