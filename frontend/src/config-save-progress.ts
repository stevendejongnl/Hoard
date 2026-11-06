import type { KlipperState } from './types'

export const RESTART_INTERVAL_MILLISECONDS = 1000
/** Klipper answers "ready" for a moment before it goes down, so a restart that was never seen counts only after this */
export const MINIMUM_RESTART_MILLISECONDS = 10000
export const RESTART_TIMEOUT_MILLISECONDS = 60000

const FAILED_STATES = ['shutdown', 'error']

export type RestartStage = 'restarting' | 'waiting'

export interface RestartProgress {
  stage: RestartStage
  elapsedSeconds: number
}

export interface RestartResult {
  outcome: 'ready' | 'failed'
  message: string
}

export interface RestartWatch {
  readState: () => Promise<KlipperState>
  sleep: (milliseconds: number) => Promise<void>
  intervalMilliseconds?: number
  minimumMilliseconds?: number
  timeoutMilliseconds?: number
}

async function readStateOrNothing(readState: () => Promise<KlipperState>): Promise<KlipperState | null> {
  try {
    return await readState()
  } catch {
    return null
  }
}

/** Follows Klipper through a restart that was just started, until it is ready, shut down, or out of time. */
export async function followRestart(
  watch: RestartWatch,
  onProgress: (progress: RestartProgress) => void,
): Promise<RestartResult> {
  const interval = watch.intervalMilliseconds ?? RESTART_INTERVAL_MILLISECONDS
  const minimum = watch.minimumMilliseconds ?? MINIMUM_RESTART_MILLISECONDS
  const timeout = watch.timeoutMilliseconds ?? RESTART_TIMEOUT_MILLISECONDS
  let sawRestart = false
  for (let elapsed = 0; elapsed < timeout; elapsed += interval) {
    const klipper = await readStateOrNothing(watch.readState)
    if (klipper && FAILED_STATES.includes(klipper.state)) {
      return { outcome: 'failed', message: klipper.message || `Klipper is in the ${klipper.state} state` }
    }
    if (klipper?.state === 'ready' && (sawRestart || elapsed >= minimum)) return { outcome: 'ready', message: '' }
    if (klipper?.state !== 'ready') sawRestart = true
    const stage: RestartStage = klipper && klipper.state !== 'ready' ? 'waiting' : 'restarting'
    onProgress({ stage, elapsedSeconds: elapsed / 1000 })
    await watch.sleep(interval)
  }
  return { outcome: 'failed', message: `Klipper was not ready after ${timeout / 1000} seconds` }
}
