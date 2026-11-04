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
  frames_leave_network: false,
  state: 'watching',
  score: 0.1,
  settings: SETTINGS,
  suggestion: null,
}

async function settle(form: DetectionSettingsForm): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await form.updateComplete
}

interface ScheduledSave {
  callback: () => void
  isCancelled: boolean
}

async function createForm(properties: Partial<DetectionSettingsForm> = {}, status: DetectionStatus = STATUS) {
  const saved: Array<Partial<DetectionSettings>> = []
  const scheduled: ScheduledSave[] = []
  const form = document.createElement('detection-settings') as DetectionSettingsForm
  form.loadStatus = async () => status
  form.saveSettings = async (changes) => {
    saved.push(changes)
    return { ...SETTINGS, ...changes }
  }
  form.scheduleSave = (callback) => {
    const entry = { callback, isCancelled: false }
    scheduled.push(entry)
    return () => void (entry.isCancelled = true)
  }
  Object.assign(form, properties)
  document.body.appendChild(form)
  await settle(form)
  return { form, saved, scheduled }
}

/** The pause is over: every save that was not replaced by a later change runs. */
async function endPause(form: DetectionSettingsForm, scheduled: ScheduledSave[]): Promise<void> {
  scheduled.filter((entry) => !entry.isCancelled).forEach((entry) => entry.callback())
  await settle(form)
}

function field(form: DetectionSettingsForm, name: string): HTMLInputElement | HTMLSelectElement {
  return form.querySelector(`[data-field="${name}"]`) as HTMLInputElement | HTMLSelectElement
}

function type(form: DetectionSettingsForm, name: string, value: string): void {
  const element = field(form, name)
  element.value = value
  element.dispatchEvent(new Event('input'))
}

function hasButton(form: DetectionSettingsForm, label: string): boolean {
  return [...form.querySelectorAll('button')].some((button) => button.textContent?.trim() === label)
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

  it('has no Save button, because a change is saved by itself', async () => {
    const { form } = await createForm()
    expect(hasButton(form, 'Save')).toBe(false)
  })

  it('saves a change after a pause, the limit as a fraction, and says so', async () => {
    const { form, saved, scheduled } = await createForm()
    type(form, 'threshold', '70')
    expect(saved).toEqual([])
    await endPause(form, scheduled)
    expect(saved).toEqual([
      { enabled: true, threshold: 0.7, interval_seconds: 10, window_size: 5, required_frames: 3, action: 'notify' },
    ])
    expect(form.textContent).toContain('Saved')
  })

  it('makes one save of several changes made before the pause is over', async () => {
    const { form, saved, scheduled } = await createForm()
    type(form, 'threshold', '70')
    type(form, 'interval_seconds', '20')
    await endPause(form, scheduled)
    expect(saved).toHaveLength(1)
    expect(saved[0].threshold).toBe(0.7)
    expect(saved[0].interval_seconds).toBe(20)
  })

  it('can switch the action to pause the print', async () => {
    const { form, saved, scheduled } = await createForm()
    const select = field(form, 'action') as HTMLSelectElement
    select.value = 'pause'
    select.dispatchEvent(new Event('change'))
    await endPause(form, scheduled)
    expect(saved[0].action).toBe('pause')
  })

  it('can switch detection off', async () => {
    const { form, saved, scheduled } = await createForm()
    const box = field(form, 'enabled') as HTMLInputElement
    box.checked = false
    box.dispatchEvent(new Event('change'))
    await endPause(form, scheduled)
    expect(saved[0].enabled).toBe(false)
  })

  it('says so when saving fails and keeps what was typed', async () => {
    const { form, scheduled } = await createForm({
      saveSettings: async () => {
        throw new Error('422')
      },
    })
    type(form, 'threshold', '70')
    await endPause(form, scheduled)
    expect(form.textContent).toContain('Could not save')
    expect((field(form, 'threshold') as HTMLInputElement).value).toBe('70')
  })

  it('saves what was changed when the page is left before the pause is over', async () => {
    const { form, saved } = await createForm()
    type(form, 'threshold', '70')
    form.remove()
    await settle(form)
    expect(saved).toHaveLength(1)
    expect(saved[0].threshold).toBe(0.7)
  })

  it('saves nothing when nothing was changed', async () => {
    const { form, saved } = await createForm()
    form.remove()
    await settle(form)
    expect(saved).toEqual([])
  })

  it('offers the suggested limit with its reason, and saves it when it is used', async () => {
    const suggestion = { threshold: 0.64, reason: 'False alarms scored up to 0.62, none were real' }
    const { form, saved, scheduled } = await createForm({}, { ...STATUS, suggestion })
    expect(form.textContent).toContain('64%')
    expect(form.textContent).toContain('False alarms scored up to 0.62')
    press(form, 'Use')
    await endPause(form, scheduled)
    expect((field(form, 'threshold') as HTMLInputElement).value).toBe('64')
    expect(saved[0].threshold).toBe(0.64)
  })

  it('offers no suggestion when there is none', async () => {
    const { form } = await createForm()
    expect(form.textContent).not.toContain('Suggested')
  })

  it('says plainly that the camera image is sent out of the network when a vision model judges it', async () => {
    const { form } = await createForm({}, { ...STATUS, frames_leave_network: true })
    expect(form.textContent).toContain('sent to an outside service')
  })

  it('says nothing about it while the detector is in the network', async () => {
    const { form } = await createForm()
    expect(form.textContent).not.toContain('outside service')
  })
})
