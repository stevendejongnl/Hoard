import { afterEach, describe, expect, it } from 'vitest'
import { html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { HttpError } from '../api'
import { ControlCard } from './control-card'

@customElement('fake-control-card')
class FakeControlCard extends ControlCard {
  press(route: string, body: object = {}): Promise<void> {
    return this.command(route, body)
  }

  render() {
    return this.renderFrame(
      'Fake',
      'move',
      html`<p class="fake-body">body</p>`,
      html`<span class="fake-note">note</span>`,
    )
  }
}

async function mount(send: (route: string, body: object) => Promise<unknown>, locked = false) {
  const card = document.createElement('fake-control-card') as FakeControlCard
  card.send = send
  card.locked = locked
  document.body.appendChild(card)
  await card.updateComplete
  return card
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('a control card', () => {
  it('has a header with its title and a note, and its body', async () => {
    const card = await mount(async () => ({}))
    expect(card.querySelector('.control-card-header')?.textContent).toContain('Fake')
    expect(card.querySelector('.control-card-header .fake-note')).not.toBeNull()
    expect(card.querySelector('.control-card-body .fake-body')).not.toBeNull()
  })

  it('sends a command to the route and tells the page, so it reads the status again', async () => {
    const sent: Array<[string, object]> = []
    const card = await mount(async (route, body) => void sent.push([route, body]))
    let told = 0
    card.addEventListener('control-changed', () => (told += 1))
    await card.press('move', { axis: 'x' })
    expect(sent).toEqual([['move', { axis: 'x' }]])
    expect(told).toBe(1)
  })

  it('shows what the printer said when it refuses, and does not tell the page', async () => {
    const card = await mount(async () => {
      throw new HttpError(502, 'Bad Gateway', 'Must home axis first')
    })
    let told = 0
    card.addEventListener('control-changed', () => (told += 1))
    await card.press('move')
    await card.updateComplete
    expect(card.querySelector('.control-card-failure')?.textContent).toContain('Must home axis first')
    expect(told).toBe(0)
  })

  it('says it is locked while printing when the server refuses with a 409', async () => {
    const card = await mount(async () => {
      throw new HttpError(409, 'Conflict', 'Locked while the printer is printing')
    })
    await card.press('move')
    await card.updateComplete
    expect(card.querySelector('.control-card-failure')?.textContent).toContain('Locked while the printer is printing')
  })

  it('has a general message when the server gave none, and clears it after the next command that works', async () => {
    let fail = true
    const card = await mount(async () => {
      if (fail) throw new Error('network')
      return {}
    })
    await card.press('move')
    await card.updateComplete
    expect(card.querySelector('.control-card-failure')?.textContent).toContain('Could not send the command')
    fail = false
    await card.press('move')
    await card.updateComplete
    expect(card.querySelector('.control-card-failure')).toBeNull()
  })

  it('marks itself locked, so a card can dim what is locked', async () => {
    const card = await mount(async () => ({}), true)
    expect(card.querySelector('.control-card')?.classList.contains('locked')).toBe(true)
  })
})

describe('an HTTP error', () => {
  it('keeps what the server said', () => {
    expect(new HttpError(409, 'Conflict', 'Locked').detail).toBe('Locked')
    expect(new HttpError(500, 'Server Error').detail).toBe('')
  })
})
