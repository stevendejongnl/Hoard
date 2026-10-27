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

/** Waits for a tag to be held to the phone and gives its id. */
export function readNextTag(createReader: NdefReaderFactory | null, signal?: AbortSignal): Promise<string> {
  if (createReader === null) return Promise.reject(new Error('NFC is not supported here'))
  return new Promise((resolve, reject) => {
    const scanning = new AbortController()
    const finish = (settle: () => void): void => {
      scanning.abort()
      settle()
    }
    signal?.addEventListener('abort', () => finish(() => reject(new Error('Scanning stopped'))))
    const reader = createReader()
    reader.addEventListener('reading', (event) =>
      finish(() => resolve(normalizeTagId((event as NdefReadingEvent).serialNumber))),
    )
    reader.addEventListener('readingerror', () => finish(() => reject(new Error('Could not read the tag'))))
    reader.scan({ signal: scanning.signal }).catch((error: Error) => finish(() => reject(error)))
  })
}
