import type { TagRecord } from './spool-tag-formats'

export interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  addEventListener(name: string, listener: (event: Event) => void): void
}

export type NdefReaderFactory = () => NdefReaderLike

interface NdefRecordLike {
  recordType: string
  mediaType?: string | null
  data?: DataView | null
}

interface NdefReadingEvent extends Event {
  serialNumber: string
  message?: { records: NdefRecordLike[] }
}

/** A tag that was held to the phone: its id, and the records of its message that have a media type. */
export interface TagReading {
  tagId: string
  records: TagRecord[]
}

export function normalizeTagId(serialNumber: string): string {
  return serialNumber.trim().toLowerCase()
}

/** Web NFC exists in Chrome on Android only. */
export function isNfcSupported(windowLike: object): boolean {
  return 'NDEFReader' in windowLike
}

export function createBrowserReaderFactory(windowLike: object): NdefReaderFactory | null {
  if (!isNfcSupported(windowLike)) return null
  const NdefReader = (windowLike as { NDEFReader: new () => NdefReaderLike }).NDEFReader
  return () => new NdefReader()
}

function copyBytes(data: DataView): Uint8Array {
  return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
}

function toTagRecord(record: NdefRecordLike): TagRecord | null {
  if (!record.mediaType || !record.data) return null
  return { mediaType: record.mediaType, data: copyBytes(record.data) }
}

function collectRecords(event: NdefReadingEvent): TagRecord[] {
  const records = event.message?.records ?? []
  return records.map(toTagRecord).filter((record): record is TagRecord => record !== null)
}

function describeReading(event: NdefReadingEvent): TagReading {
  return { tagId: normalizeTagId(event.serialNumber), records: collectRecords(event) }
}

/** One scan: ends once, whether a tag was read, reading failed or the caller stopped it. */
class TagScan {
  private readonly scanning = new AbortController()

  constructor(
    private readonly resolve: (reading: TagReading) => void,
    private readonly reject: (error: Error) => void,
  ) {}

  get signal(): AbortSignal {
    return this.scanning.signal
  }

  succeed(reading: TagReading): void {
    this.scanning.abort()
    this.resolve(reading)
  }

  fail(error: Error): void {
    this.scanning.abort()
    this.reject(error)
  }
}

function startScan(
  reader: NdefReaderLike,
  stopSignal: AbortSignal | undefined,
  resolve: (reading: TagReading) => void,
  reject: (error: Error) => void,
): void {
  const scan = new TagScan(resolve, reject)
  stopSignal?.addEventListener('abort', () => scan.fail(new Error('Scanning stopped')))
  reader.addEventListener('reading', (event) => scan.succeed(describeReading(event as NdefReadingEvent)))
  reader.addEventListener('readingerror', () => scan.fail(new Error('Could not read the tag')))
  reader.scan({ signal: scan.signal }).catch((error: Error) => scan.fail(error))
}

/** Waits for a tag to be held to the phone and gives its id and what is on it. */
export function readNextTagReading(createReader: NdefReaderFactory | null, signal?: AbortSignal): Promise<TagReading> {
  if (createReader === null) return Promise.reject(new Error('NFC is not supported here'))
  return new Promise((resolve, reject) => startScan(createReader(), signal, resolve, reject))
}

/** Waits for a tag to be held to the phone and gives its id. */
export async function readNextTag(createReader: NdefReaderFactory | null, signal?: AbortSignal): Promise<string> {
  return (await readNextTagReading(createReader, signal)).tagId
}
