import { describe, expect, it } from 'vitest'
import { createPushClient } from './notifications'
import type { PushEnvironment } from './notifications'

interface FakeSubscription {
  endpoint: string
  unsubscribed: boolean
  unsubscribe(): Promise<boolean>
  toJSON(): { endpoint: string; keys: Record<string, string> }
}

function createSubscription(endpoint = 'https://push.example/1'): FakeSubscription {
  const subscription: FakeSubscription = {
    endpoint,
    unsubscribed: false,
    unsubscribe: async () => {
      subscription.unsubscribed = true
      return true
    },
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
  }
  return subscription
}

class FakeEnvironment implements PushEnvironment {
  isSupported = true
  hasServiceWorker = true
  permission: NotificationPermission = 'granted'
  existingSubscription: FakeSubscription | null = null
  subscribeOptions: PushSubscriptionOptionsInit[] = []
  requests: { url: string; requestOptions?: RequestInit }[] = []
  registeredWorkers: string[] = []
  rejectRegistration = false
  vapidKey = 'AQAB'

  supportsPush(): boolean {
    return this.isSupported
  }

  supportsServiceWorker(): boolean {
    return this.hasServiceWorker
  }

  requestPermission(): Promise<NotificationPermission> {
    return Promise.resolve(this.permission)
  }

  async readRegistration(): Promise<ServiceWorkerRegistration> {
    return { pushManager: this.pushManager } as unknown as ServiceWorkerRegistration
  }

  private pushManager = {
    getSubscription: async () => this.existingSubscription,
    subscribe: async (options: PushSubscriptionOptionsInit) => {
      this.subscribeOptions.push(options)
      this.existingSubscription = createSubscription()
      return this.existingSubscription
    },
  }

  async requestJson(url: string, requestOptions?: RequestInit): Promise<{ key?: string }> {
    this.requests.push({ url, requestOptions })
    return { key: this.vapidKey }
  }

  registerWorker(path: string): Promise<unknown> {
    this.registeredWorkers.push(path)
    return this.rejectRegistration ? Promise.reject(new Error('no')) : Promise.resolve({})
  }
}

describe('whether push works here', () => {
  it('follows the environment', () => {
    const environment = new FakeEnvironment()
    expect(createPushClient(environment).isSupported()).toBe(true)
    environment.isSupported = false
    expect(createPushClient(environment).isSupported()).toBe(false)
  })

  it('is configured when the server has a key, and not when it has none', async () => {
    const environment = new FakeEnvironment()
    expect(await createPushClient(environment).isConfigured()).toBe(true)
    environment.vapidKey = ''
    expect(await createPushClient(environment).isConfigured()).toBe(false)
  })
})

describe('the subscription', () => {
  it('is none where push is not supported', async () => {
    const environment = new FakeEnvironment()
    environment.isSupported = false
    expect(await createPushClient(environment).loadSubscription()).toBeNull()
  })

  it('is the one the browser has', async () => {
    const environment = new FakeEnvironment()
    environment.existingSubscription = createSubscription()
    expect(await createPushClient(environment).loadSubscription()).toBe(environment.existingSubscription)
  })
})

describe('subscribing', () => {
  it('asks the server for the key, subscribes with it, and sends the subscription to the server', async () => {
    const environment = new FakeEnvironment()
    await createPushClient(environment).subscribe()
    const options = environment.subscribeOptions[0]
    expect(options.userVisibleOnly).toBe(true)
    expect(Array.from(options.applicationServerKey as Uint8Array)).toEqual([1, 0, 1])
    const sent = environment.requests.find((request) => request.url === '/api/push/subscribe')
    expect(sent?.requestOptions?.method).toBe('POST')
    expect(JSON.parse(String(sent?.requestOptions?.body))).toEqual({
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'p', auth: 'a' },
    })
  })

  it('stops when the person does not allow notifications, without asking the server anything', async () => {
    const environment = new FakeEnvironment()
    environment.permission = 'denied'
    await expect(createPushClient(environment).subscribe()).rejects.toThrow('permission denied')
    expect(environment.requests).toEqual([])
  })
})

describe('unsubscribing', () => {
  it('tells the server and drops the subscription', async () => {
    const environment = new FakeEnvironment()
    const subscription = createSubscription()
    environment.existingSubscription = subscription
    await createPushClient(environment).unsubscribe()
    const sent = environment.requests.find((request) => request.url === '/api/push/unsubscribe')
    expect(JSON.parse(String(sent?.requestOptions?.body))).toEqual({ endpoint: 'https://push.example/1' })
    expect(subscription.unsubscribed).toBe(true)
  })

  it('does nothing when there is no subscription', async () => {
    const environment = new FakeEnvironment()
    await createPushClient(environment).unsubscribe()
    expect(environment.requests).toEqual([])
  })
})

describe('the service worker', () => {
  it('is registered where service workers work', () => {
    const environment = new FakeEnvironment()
    createPushClient(environment).registerServiceWorker()
    expect(environment.registeredWorkers).toEqual(['/sw.js'])
  })

  it('is registered where push is missing but service workers are there', () => {
    const environment = new FakeEnvironment()
    environment.isSupported = false
    createPushClient(environment).registerServiceWorker()
    expect(environment.registeredWorkers).toEqual(['/sw.js'])
  })

  it('is not registered where service workers are missing', () => {
    const environment = new FakeEnvironment()
    environment.hasServiceWorker = false
    createPushClient(environment).registerServiceWorker()
    expect(environment.registeredWorkers).toEqual([])
  })

  it('does not throw when the registration fails', async () => {
    const environment = new FakeEnvironment()
    environment.rejectRegistration = true
    expect(() => createPushClient(environment).registerServiceWorker()).not.toThrow()
    await Promise.resolve()
  })
})
