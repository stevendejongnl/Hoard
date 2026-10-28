import { describe, expect, it } from 'vitest'
import { isNfcSupported, normalizeTagId, readNextTag } from './nfc-reader'
import type { NdefReaderLike } from './nfc-reader'

class FakeReader implements NdefReaderLike {
  private listeners = new Map<string, ((event: Event) => void)[]>()
  scans: AbortSignal[] = []
  scanError: Error | null = null

  async scan(options?: { signal?: AbortSignal }): Promise<void> {
    if (this.scanError) throw this.scanError
    if (options?.signal) this.scans.push(options.signal)
  }

  addEventListener(name: string, listener: (event: Event) => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }

  emitReading(serialNumber: string): void {
    const event = Object.assign(new Event('reading'), { serialNumber })
    this.listeners.get('reading')?.forEach((listener) => listener(event))
  }

  emitError(): void {
    this.listeners.get('readingerror')?.forEach((listener) => listener(new Event('readingerror')))
  }
}

describe('tag ids', () => {
  it('are written in lower case without surrounding spaces', () => {
    expect(normalizeTagId(' 04:A2:2B:1C ')).toBe('04:a2:2b:1c')
  })
})

describe('support', () => {
  it('needs the NDEFReader of Web NFC', () => {
    expect(isNfcSupported({ NDEFReader: class {} })).toBe(true)
    expect(isNfcSupported({})).toBe(false)
  })
})

describe('reading the next tag', () => {
  it('gives the id of the first tag held to the phone', async () => {
    const reader = new FakeReader()
    const reading = readNextTag(() => reader)
    await Promise.resolve()
    await Promise.resolve()
    reader.emitReading('04:A2:2B')
    expect(await reading).toBe('04:a2:2b')
  })

  it('fails when the browser cannot read tags', async () => {
    await expect(readNextTag(null)).rejects.toThrow('NFC is not supported here')
  })

  it('fails when scanning is refused', async () => {
    const reader = new FakeReader()
    reader.scanError = new Error('permission denied')
    await expect(readNextTag(() => reader)).rejects.toThrow('permission denied')
  })

  it('fails when the tag cannot be read', async () => {
    const reader = new FakeReader()
    const reading = readNextTag(() => reader)
    await Promise.resolve()
    await Promise.resolve()
    reader.emitError()
    await expect(reading).rejects.toThrow('Could not read the tag')
  })

  it('stops scanning when it is cancelled', async () => {
    const reader = new FakeReader()
    const controller = new AbortController()
    const reading = readNextTag(() => reader, controller.signal)
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()
    await expect(reading).rejects.toThrow('Scanning stopped')
    expect(reader.scans[0].aborted).toBe(true)
  })
})
