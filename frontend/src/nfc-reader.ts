export interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  addEventListener(name: string, listener: (event: Event) => void): void
}

export type NdefReaderFactory = () => NdefReaderLike

interface NdefReadingEvent extends Event {
  serialNumber: string
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

/** One scan: ends once, whether a tag was read, reading failed or the caller stopped it. */
class TagScan {
  private readonly scanning = new AbortController()

  constructor(
    private readonly resolve: (tagId: string) => void,
    private readonly reject: (error: Error) => void,
  ) {}

  get signal(): AbortSignal {
    return this.scanning.signal
  }

  succeed(serialNumber: string): void {
    this.scanning.abort()
    this.resolve(normalizeTagId(serialNumber))
  }

  fail(error: Error): void {
    this.scanning.abort()
    this.reject(error)
  }
}

function startScan(
  reader: NdefReaderLike,
  stopSignal: AbortSignal | undefined,
  resolve: (tagId: string) => void,
  reject: (error: Error) => void,
): void {
  const scan = new TagScan(resolve, reject)
  stopSignal?.addEventListener('abort', () => scan.fail(new Error('Scanning stopped')))
  reader.addEventListener('reading', (event) => scan.succeed((event as NdefReadingEvent).serialNumber))
  reader.addEventListener('readingerror', () => scan.fail(new Error('Could not read the tag')))
  reader.scan({ signal: scan.signal }).catch((error: Error) => scan.fail(error))
}

/** Waits for a tag to be held to the phone and gives its id. */
export function readNextTag(createReader: NdefReaderFactory | null, signal?: AbortSignal): Promise<string> {
  if (createReader === null) return Promise.reject(new Error('NFC is not supported here'))
  return new Promise((resolve, reject) => startScan(createReader(), signal, resolve, reject))
}
