import { afterEach, describe, expect, it } from 'vitest'
import './control-access-prompt'
import type { ControlAccessPrompt } from './control-access-prompt'
import type { ControlAccessSnapshot } from '../types'

const NOW = 1_000_000

const ASKING: ControlAccessSnapshot = {
  pending: [{ id: 'one', client: 'claude', reason: 'Level the bed', expires_at: NOW + 200 }],
  granted: [],
}

interface Setup {
  prompt: ControlAccessPrompt
  calls: string[]
  push: (payload: { type: string; data: unknown }) => void
  clock: { now: number }
  setServer: (snapshot: ControlAccessSnapshot) => void
}

async function settle(prompt: ControlAccessPrompt): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await prompt.updateComplete
}

async function mount(first: ControlAccessSnapshot = { pending: [], granted: [] }): Promise<Setup> {
  const calls: string[] = []
  const clock = { now: NOW }
  let server = first
  let handler: (payload: { type: string; data: unknown }) => void = () => undefined
  const prompt = document.createElement('control-access-prompt') as ControlAccessPrompt
  prompt.loadAccess = async () => server
  prompt.allow = async (id) => void calls.push(`allow ${id}`)
  prompt.deny = async (id) => void calls.push(`deny ${id}`)
  prompt.takeBack = async (client) => void calls.push(`take back ${client}`)
  prompt.subscribeToUpdates = (receive) => {
    handler = receive
    return () => undefined
  }
  prompt.now = () => clock.now
  prompt.repeatEvery = () => () => undefined
  document.body.appendChild(prompt)
  await settle(prompt)
  return {
    prompt,
    calls,
    clock,
    push: (payload) => handler(payload),
    setServer: (snapshot) => (server = snapshot),
  }
}

function press(root: ParentNode, label: string): void {
  const found = [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === label)
  if (!found) throw new Error(`no button "${label}"`)
  found.click()
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the request of an assistant to control the printer', () => {
  it('shows nothing while nobody asks and nobody may', async () => {
    const { prompt } = await mount()
    expect(prompt.querySelector('.control-access-dialog')).toBeNull()
    expect(prompt.querySelector('.control-access-grant')).toBeNull()
  })

  it('asks the person, saying who asks and what for', async () => {
    const { prompt } = await mount(ASKING)
    const dialog = prompt.querySelector('.control-access-dialog') as HTMLElement
    expect(dialog.getAttribute('role')).toBe('alertdialog')
    expect(dialog.textContent).toContain('claude')
    expect(dialog.textContent).toContain('control the printer')
    expect(dialog.textContent).toContain('Level the bed')
  })

  it('shows the reason as plain text, because the assistant wrote it', async () => {
    const reason = '<img src=x onerror=alert(1)>'
    const { prompt } = await mount({ pending: [{ ...ASKING.pending[0], reason }], granted: [] })
    expect(prompt.querySelector('.control-access-dialog img')).toBeNull()
    expect(prompt.querySelector('.control-access-dialog')?.textContent).toContain(reason)
  })

  it('says how long the access lasts, and that it ends by itself', async () => {
    const { prompt } = await mount(ASKING)
    expect(prompt.textContent).toContain('Allow for 30 minutes')
    expect(prompt.textContent).toContain('ends by itself')
  })

  it('allows the request, and reads the state again', async () => {
    const setup = await mount(ASKING)
    setup.setServer({ pending: [], granted: [{ client: 'claude', expires_at: NOW + 1800 }] })
    press(setup.prompt, 'Allow for 30 minutes')
    await settle(setup.prompt)
    expect(setup.calls).toEqual(['allow one'])
    expect(setup.prompt.querySelector('.control-access-dialog')).toBeNull()
    expect(setup.prompt.querySelector('.control-access-grant')).not.toBeNull()
  })

  it('denies the request', async () => {
    const setup = await mount(ASKING)
    setup.setServer({ pending: [], granted: [] })
    press(setup.prompt, 'Deny')
    await settle(setup.prompt)
    expect(setup.calls).toEqual(['deny one'])
    expect(setup.prompt.querySelector('.control-access-dialog')).toBeNull()
  })

  it('shows a request that arrives over the stream', async () => {
    const setup = await mount()
    setup.push({ type: 'control_access', data: ASKING })
    await settle(setup.prompt)
    expect(setup.prompt.querySelector('.control-access-dialog')).not.toBeNull()
  })

  it('ignores other events of the stream', async () => {
    const setup = await mount()
    setup.push({ type: 'temps', data: {} })
    await settle(setup.prompt)
    expect(setup.prompt.querySelector('.control-access-dialog')).toBeNull()
  })

  it('stops showing a request when its time is up', async () => {
    const setup = await mount(ASKING)
    setup.clock.now = NOW + 200
    setup.prompt.requestUpdate()
    await settle(setup.prompt)
    expect(setup.prompt.querySelector('.control-access-dialog')).toBeNull()
  })
})

describe('the assistants that may control the printer', () => {
  const GRANTED: ControlAccessSnapshot = { pending: [], granted: [{ client: 'claude', expires_at: NOW + 1500 }] }

  it('shows who may, and for how long', async () => {
    const { prompt } = await mount(GRANTED)
    const grant = prompt.querySelector('.control-access-grant') as HTMLElement
    expect(grant.textContent).toContain('claude')
    expect(grant.textContent).toContain('25 min')
  })

  it('takes the access back at once with a button', async () => {
    const setup = await mount(GRANTED)
    setup.setServer({ pending: [], granted: [] })
    press(setup.prompt, 'Take back')
    await settle(setup.prompt)
    expect(setup.calls).toEqual(['take back claude'])
    expect(setup.prompt.querySelector('.control-access-grant')).toBeNull()
  })

  it('stops showing the access when it has ended', async () => {
    const setup = await mount(GRANTED)
    setup.clock.now = NOW + 1500
    setup.prompt.requestUpdate()
    await settle(setup.prompt)
    expect(setup.prompt.querySelector('.control-access-grant')).toBeNull()
  })

  it('rounds the time left up to a whole minute', async () => {
    const { prompt } = await mount({ pending: [], granted: [{ client: 'claude', expires_at: NOW + 61 }] })
    expect(prompt.querySelector('.control-access-grant')?.textContent).toContain('2 min')
  })
})

describe('when the state cannot be read', () => {
  it('shows nothing', async () => {
    const prompt = document.createElement('control-access-prompt') as ControlAccessPrompt
    prompt.loadAccess = async () => {
      throw new Error('offline')
    }
    prompt.subscribeToUpdates = () => () => undefined
    prompt.repeatEvery = () => () => undefined
    document.body.appendChild(prompt)
    await settle(prompt)
    expect(prompt.querySelector('.control-access-dialog')).toBeNull()
  })
})
