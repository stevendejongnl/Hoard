import { afterEach, describe, expect, it } from 'vitest'
import './push-toggle'
import type { PushToggle } from './push-toggle'

interface Calls {
  subscribed: number
  unsubscribed: number
}

async function settle(toggle: PushToggle): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await toggle.updateComplete
}

async function createToggle(properties: Partial<PushToggle> = {}, calls: Calls = { subscribed: 0, unsubscribed: 0 }) {
  let isSubscribed = false
  const toggle = document.createElement('push-toggle') as PushToggle
  toggle.isSupported = () => true
  toggle.isConfigured = async () => true
  toggle.loadSubscription = async () => (isSubscribed ? {} : null)
  toggle.subscribe = async () => {
    calls.subscribed += 1
    isSubscribed = true
  }
  toggle.unsubscribe = async () => {
    calls.unsubscribed += 1
    isSubscribed = false
  }
  Object.assign(toggle, properties)
  document.body.appendChild(toggle)
  await settle(toggle)
  return { toggle, calls }
}

function findButton(toggle: PushToggle): HTMLButtonElement | null {
  return toggle.querySelector<HTMLButtonElement>('.push-button')
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('push toggle', () => {
  it('is not shown where the browser cannot receive push', async () => {
    const { toggle } = await createToggle({ isSupported: () => false })
    expect(findButton(toggle)).toBeNull()
  })

  it('is not shown while the server has no push key', async () => {
    const { toggle } = await createToggle({ isConfigured: async () => false })
    expect(findButton(toggle)).toBeNull()
  })

  it('is not shown when asking the server fails', async () => {
    const { toggle } = await createToggle({
      isConfigured: async () => {
        throw new Error('offline')
      },
    })
    expect(findButton(toggle)).toBeNull()
  })

  it('offers to enable notifications when there is no subscription', async () => {
    const { toggle } = await createToggle()
    expect(findButton(toggle)?.getAttribute('aria-label')).toBe('Enable print notifications')
  })

  it('offers to disable notifications when subscribed', async () => {
    const { toggle } = await createToggle({ loadSubscription: async () => ({}) })
    expect(findButton(toggle)?.getAttribute('aria-label')).toBe('Disable print notifications')
  })

  it('subscribes on a click and then offers to disable', async () => {
    const { toggle, calls } = await createToggle()
    findButton(toggle)!.click()
    await settle(toggle)
    expect(calls.subscribed).toBe(1)
    expect(findButton(toggle)?.getAttribute('aria-label')).toBe('Disable print notifications')
  })

  it('unsubscribes on a click when subscribed', async () => {
    const calls: Calls = { subscribed: 0, unsubscribed: 0 }
    const { toggle } = await createToggle({ loadSubscription: async () => ({}) }, calls)
    findButton(toggle)!.click()
    await settle(toggle)
    expect(calls.unsubscribed).toBe(1)
  })

  it('stays as it was when the permission is denied', async () => {
    const { toggle } = await createToggle({
      subscribe: async () => {
        throw new Error('permission denied')
      },
    })
    findButton(toggle)!.click()
    await settle(toggle)
    expect(findButton(toggle)?.getAttribute('aria-label')).toBe('Enable print notifications')
  })
})
