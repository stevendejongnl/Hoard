import { describe, expect, it } from 'vitest'
import { followRestart } from './config-save-progress'
import type { RestartProgress } from './config-save-progress'
import type { KlipperState } from './types'

const READY: KlipperState = { state: 'ready', message: '' }
const STARTUP: KlipperState = { state: 'startup', message: 'Loading' }
const UNREACHABLE = new Error('offline')

function watch(answers: (KlipperState | Error)[], overrides: { timeoutMilliseconds?: number } = {}) {
  const reads: number[] = []
  const progress: RestartProgress[] = []
  const queue = [...answers]
  const options = {
    readState: async () => {
      reads.push(reads.length)
      const answer = queue.length > 1 ? queue.shift()! : queue[0]
      if (answer instanceof Error) throw answer
      return answer
    },
    sleep: async () => undefined,
    intervalMilliseconds: 1000,
    minimumMilliseconds: 3000,
    timeoutMilliseconds: 60000,
    ...overrides,
  }
  const result = followRestart(options, (step) => progress.push(step))
  return { result, reads, progress }
}

describe('following a restart of Klipper', () => {
  it('is ready when Klipper went away and came back', async () => {
    const { result, progress } = watch([UNREACHABLE, STARTUP, READY])
    expect((await result).outcome).toBe('ready')
    expect(progress.map((step) => step.stage)).toEqual(['restarting', 'waiting'])
  })

  it('does not trust a ready answer that comes before the restart was seen', async () => {
    const { result, reads } = watch([READY, READY, UNREACHABLE, STARTUP, READY])
    expect((await result).outcome).toBe('ready')
    expect(reads).toHaveLength(5)
  })

  it('trusts a ready Klipper after the minimum time, when the restart was too fast to see', async () => {
    const { result, reads } = watch([READY])
    expect((await result).outcome).toBe('ready')
    expect(reads).toHaveLength(4)
  })

  it('fails at once when Klipper is shut down, with what Klipper says', async () => {
    const { result } = watch([UNREACHABLE, { state: 'shutdown', message: "Lost communication with MCU 'mcu'" }])
    expect(await result).toEqual({ outcome: 'failed', message: "Lost communication with MCU 'mcu'" })
  })

  it('fails when Klipper is not ready in time, and says how long it waited', async () => {
    const { result } = watch([UNREACHABLE], { timeoutMilliseconds: 5000 })
    expect(await result).toEqual({ outcome: 'failed', message: 'Klipper was not ready after 5 seconds' })
  })

  it('reports how many seconds have passed with every step', async () => {
    const { result, progress } = watch([UNREACHABLE, UNREACHABLE, STARTUP, READY])
    await result
    expect(progress.map((step) => step.elapsedSeconds)).toEqual([0, 1, 2])
  })
})
