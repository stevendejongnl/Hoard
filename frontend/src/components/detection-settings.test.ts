import { afterEach, describe, expect, it } from 'vitest'
import './detection-settings'
import type { DetectionSettingsForm } from './detection-settings'
import type { DetectionSettings, DetectionStatus } from '../types'

const SETTINGS: DetectionSettings = {
  enabled: true,
  threshold: 0.5,
  interval_seconds: 10,
  window_size: 5,
  required_frames: 3,
  action: 'notify',
}

const STATUS: DetectionStatus = {
  configured: true,
  state: 'watching',
  score: 0.1,
  settings: SETTINGS,
  suggestion: null,
}

async function settle(form: DetectionSettingsForm): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await form.updateComplete
}

async function createForm(properties: Partial<DetectionSettingsForm> = {}, status: DetectionStatus = STATUS) {
  const saved: Array<Partial<DetectionSettings>> = []
  const form = document.createElement('detection-settings') as DetectionSettingsForm
  form.loadStatus = async () => status
  form.saveSettings = async (changes) => {
    saved.push(changes)
    return { ...SETTINGS, ...changes }
  }
  Object.assign(form, properties)
  document.body.appendChild(form)
  await settle(form)
  return { form, saved }
}

function field(form: DetectionSettingsForm, name: string): HTMLInputElement | HTMLSelectElement {
  return form.querySelector(`[data-field="${name}"]`) as HTMLInputElement | HTMLSelectElement
}

function type(form: DetectionSettingsForm, name: string, value: string): void {
  const element = field(form, name)
  element.value = value
  element.dispatchEvent(new Event('input'))
}

function press(form: DetectionSettingsForm, label: string): void {
  ;[...form.querySelectorAll('button')].find((button) => button.textContent?.trim() === label)?.click()
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('detection settings', () => {
  it('shows nothing while the server has no detector', async () => {
    const { form } = await createForm({}, { ...STATUS, configured: false })
    expect(form.hidden).toBe(true)
    expect(form.textContent?.trim()).toBe('')
  })

  it('shows nothing when asking the server fails', async () => {
    const { form } = await createForm({
      loadStatus: async () => {
        throw new Error('offline')
      },
    })
    expect(form.hidden).toBe(true)
  })

  it('shows the current values, the limit as a percent', async () => {
    const { form } = await createForm()
    expect((field(form, 'threshold') as HTMLInputElement).value).toBe('50')
    expect((field(form, 'interval_seconds') as HTMLInputElement).value).toBe('10')
    expect((field(form, 'required_frames') as HTMLInputElement).value).toBe('3')
    expect((field(form, 'window_size') as HTMLInputElement).value).toBe('5')
    expect((field(form, 'action') as HTMLSelectElement).value).toBe('notify')
    expect((field(form, 'enabled') as HTMLInputElement).checked).toBe(true)
  })

  it('saves every value, the limit as a fraction, and says so', async () => {
    const { form, saved } = await createForm()
    type(form, 'threshold', '70')
    press(form, 'Save')
    await settle(form)
    expect(saved).toEqual([
      { enabled: true, threshold: 0.7, interval_seconds: 10, window_size: 5, required_frames: 3, action: 'notify' },
    ])
    expect(form.textContent).toContain('Saved')
  })

  it('can switch the action to pause the print', async () => {
    const { form, saved } = await createForm()
    const select = field(form, 'action') as HTMLSelectElement
    select.value = 'pause'
    select.dispatchEvent(new Event('change'))
    press(form, 'Save')
    await settle(form)
    expect(saved[0].action).toBe('pause')
  })

  it('can switch detection off', async () => {
    const { form, saved } = await createForm()
    const box = field(form, 'enabled') as HTMLInputElement
    box.checked = false
    box.dispatchEvent(new Event('change'))
    press(form, 'Save')
    await settle(form)
    expect(saved[0].enabled).toBe(false)
  })

  it('says so when saving fails and keeps what was typed', async () => {
    const { form } = await createForm({
      saveSettings: async () => {
        throw new Error('422')
      },
    })
    type(form, 'threshold', '70')
    press(form, 'Save')
    await settle(form)
    expect(form.textContent).toContain('Could not save')
    expect((field(form, 'threshold') as HTMLInputElement).value).toBe('70')
  })

  it('offers the suggested limit with its reason, and only fills it in', async () => {
    const suggestion = { threshold: 0.64, reason: 'False alarms scored up to 0.62, none were real' }
    const { form, saved } = await createForm({}, { ...STATUS, suggestion })
    expect(form.textContent).toContain('64%')
    expect(form.textContent).toContain('False alarms scored up to 0.62')
    press(form, 'Use')
    await settle(form)
    expect((field(form, 'threshold') as HTMLInputElement).value).toBe('64')
    expect(saved).toEqual([])
  })

  it('offers no suggestion when there is none', async () => {
    const { form } = await createForm()
    expect(form.textContent).not.toContain('Suggested')
  })
})
