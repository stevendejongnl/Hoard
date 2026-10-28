/** What push needs from the browser and the server, so a test can hand it fakes. */
export interface PushEnvironment {
  supportsPush(): boolean
  supportsServiceWorker(): boolean
  requestPermission(): Promise<NotificationPermission>
  readRegistration(): Promise<ServiceWorkerRegistration>
  requestJson(url: string, requestOptions?: RequestInit): Promise<{ key?: string }>
  registerWorker(path: string): Promise<unknown>
}

const VAPID_KEY_URL = '/api/push/vapid-public-key'
const JSON_HEADERS = { 'Content-Type': 'application/json' }

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let index = 0; index < rawData.length; index++) {
    outputArray[index] = rawData.charCodeAt(index)
  }
  return outputArray
}

function postJson(environment: PushEnvironment, url: string, body: unknown): Promise<unknown> {
  return environment.requestJson(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
}

export const browserPushEnvironment: PushEnvironment = {
  supportsPush: () => 'serviceWorker' in navigator && 'PushManager' in window,
  supportsServiceWorker: () => 'serviceWorker' in navigator,
  requestPermission: () => Notification.requestPermission(),
  readRegistration: () => navigator.serviceWorker.ready,
  requestJson: (url, requestOptions) => fetch(url, requestOptions).then((reply) => reply.json()),
  registerWorker: (path) => navigator.serviceWorker.register(path),
}

export class PushClient {
  constructor(private readonly environment: PushEnvironment) {}

  isSupported(): boolean {
    return this.environment.supportsPush()
  }

  async isConfigured(): Promise<boolean> {
    return Boolean((await this.environment.requestJson(VAPID_KEY_URL)).key)
  }

  async loadSubscription(): Promise<PushSubscription | null> {
    if (!this.environment.supportsPush()) return null
    const registration = await this.environment.readRegistration()
    return registration.pushManager.getSubscription()
  }

  async subscribe(): Promise<void> {
    const permission = await this.environment.requestPermission()
    if (permission !== 'granted') throw new Error('permission denied')
    const keyResponse = await this.environment.requestJson(VAPID_KEY_URL)
    const registration = await this.environment.readRegistration()
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyResponse.key ?? '') as BufferSource,
    })
    const json = subscription.toJSON()
    await postJson(this.environment, '/api/push/subscribe', { endpoint: json.endpoint, keys: json.keys })
  }

  async unsubscribe(): Promise<void> {
    const subscription = await this.loadSubscription()
    if (!subscription) return
    await postJson(this.environment, '/api/push/unsubscribe', { endpoint: subscription.endpoint })
    await subscription.unsubscribe()
  }

  registerServiceWorker(): void {
    if (!this.environment.supportsServiceWorker()) return
    this.environment.registerWorker('/sw.js').catch(() => {})
  }
}

export function createPushClient(environment: PushEnvironment = browserPushEnvironment): PushClient {
  return new PushClient(environment)
}

const browserPushClient = createPushClient()

export const pushSupported = (): boolean => browserPushClient.isSupported()
export const isPushConfigured = (): Promise<boolean> => browserPushClient.isConfigured()
export const getPushSubscription = (): Promise<PushSubscription | null> => browserPushClient.loadSubscription()
export const subscribeToPush = (): Promise<void> => browserPushClient.subscribe()
export const unsubscribeFromPush = (): Promise<void> => browserPushClient.unsubscribe()
export const registerServiceWorker = (): void => browserPushClient.registerServiceWorker()
