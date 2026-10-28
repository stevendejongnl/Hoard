import { describe, expect, it } from 'vitest'
import { StreamWatchdog, reconnectDelayMilliseconds, withReconnectParameter } from './camera-stream-watchdog'
import type { FrameSample } from './camera-stream-watchdog'

const STALE_AFTER = 2000
const RECONNECT_AFTER = 8000

function createFrame(signature: string, overrides: Partial<FrameSample> = {}): FrameSample {
  return { signature, isBlank: false, ...overrides }
}

function createWatchdog(): StreamWatchdog {
  return new StreamWatchdog(STALE_AFTER, RECONNECT_AFTER)
}

describe('the watchdog of a camera stream', () => {
  it('is not stale while frames keep changing', () => {
    const watchdog = createWatchdog()
    watchdog.observe(createFrame('a'), 0)
    watchdog.observe(createFrame('b'), 1500)
    expect(watchdog.observe(createFrame('c'), 3000)).toMatchObject({ isStale: false, shouldReconnect: false })
  })

  it('is not stale right after it started, before the first frame', () => {
    expect(createWatchdog().observe(null, 0)).toMatchObject({ isStale: false, shouldReconnect: false })
  })

  it('is stale when the frame does not change for the stale time', () => {
    const watchdog = createWatchdog()
    watchdog.observe(createFrame('a'), 0)
    expect(watchdog.observe(createFrame('a'), STALE_AFTER - 1).isStale).toBe(false)
    expect(watchdog.observe(createFrame('a'), STALE_AFTER).isStale).toBe(true)
  })

  it('counts a blank frame as no frame, and so is stale when only blank frames come', () => {
    const watchdog = createWatchdog()
    watchdog.observe(createFrame('a'), 0)
    expect(watchdog.observe(createFrame('b', { isBlank: true }), STALE_AFTER).isStale).toBe(true)
  })

  it('counts a missing frame as no frame', () => {
    const watchdog = createWatchdog()
    watchdog.observe(createFrame('a'), 0)
    expect(watchdog.observe(null, STALE_AFTER).isStale).toBe(true)
  })

  it('asks to reconnect only after the reconnect time', () => {
    const watchdog = createWatchdog()
    watchdog.observe(createFrame('a'), 0)
    expect(watchdog.observe(createFrame('a'), RECONNECT_AFTER - 1).shouldReconnect).toBe(false)
    expect(watchdog.observe(createFrame('a'), RECONNECT_AFTER).shouldReconnect).toBe(true)
  })

  it('is live again as soon as a new frame arrives', () => {
    const watchdog = createWatchdog()
    watchdog.observe(createFrame('a'), 0)
    watchdog.observe(createFrame('a'), RECONNECT_AFTER)
    expect(watchdog.observe(createFrame('b'), RECONNECT_AFTER + 100)).toMatchObject({
      isStale: false,
      shouldReconnect: false,
    })
  })

  it('gives a new connection time to deliver a frame after a reset', () => {
    const watchdog = createWatchdog()
    watchdog.observe(createFrame('a'), 0)
    watchdog.reset(RECONNECT_AFTER)
    expect(watchdog.observe(null, RECONNECT_AFTER + STALE_AFTER - 1)).toMatchObject({
      isStale: false,
      shouldReconnect: false,
    })
    expect(watchdog.observe(null, RECONNECT_AFTER + STALE_AFTER).isStale).toBe(true)
  })

  it('reports a new frame only when the frame changed and is not blank', () => {
    const watchdog = createWatchdog()
    expect(watchdog.observe(createFrame('a'), 0).hasNewFrame).toBe(true)
    expect(watchdog.observe(createFrame('a'), 500).hasNewFrame).toBe(false)
    expect(watchdog.observe(createFrame('b', { isBlank: true }), 1000).hasNewFrame).toBe(false)
    expect(watchdog.observe(null, 1500).hasNewFrame).toBe(false)
    expect(watchdog.observe(createFrame('c'), 2000).hasNewFrame).toBe(true)
  })

  it('treats the same frame again after a reset as a new frame', () => {
    const watchdog = createWatchdog()
    watchdog.observe(createFrame('a'), 0)
    watchdog.reset(1000)
    expect(watchdog.observe(createFrame('a'), 1000 + STALE_AFTER - 1).isStale).toBe(false)
  })
})

describe('the delay before the stream is loaded again', () => {
  it('doubles with every failure, from one second up to ten seconds', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(reconnectDelayMilliseconds)).toEqual([1000, 2000, 4000, 8000, 10000, 10000, 10000])
  })
})

describe('the address of a reloaded stream', () => {
  it('stays the same for the first connection', () => {
    expect(withReconnectParameter('/api/webcams/0/stream', 0)).toBe('/api/webcams/0/stream')
  })

  it('gets a parameter that makes the browser load it again', () => {
    expect(withReconnectParameter('/api/webcams/0/stream', 2)).toBe('/api/webcams/0/stream?reconnect=2')
  })

  it('adds the parameter to an address that has a query already', () => {
    expect(withReconnectParameter('/stream?camera=1', 3)).toBe('/stream?camera=1&reconnect=3')
  })
})
