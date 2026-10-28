import { afterEach, describe, expect, it } from 'vitest'
import './link-preview-card'
import type { LinkPreviewCard } from './link-preview-card'
import type { ProjectLink } from '../types'

const LINK_WITH_PREVIEW: ProjectLink = {
  id: 1,
  project_id: 7,
  url: 'https://example.com/model',
  label: null,
  meta: { title: 'A model' },
}

const LINK_WITHOUT_PREVIEW: ProjectLink = { ...LINK_WITH_PREVIEW, meta: null }

const mountedCards: LinkPreviewCard[] = []

class FakeTimers {
  private pending = new Map<number, () => void>()
  private nextHandle = 1

  schedule = (callback: () => void): number => {
    this.pending.set(this.nextHandle, callback)
    return this.nextHandle++
  }

  cancel = (handle: number): void => {
    this.pending.delete(handle)
  }

  runAll(): void {
    const callbacks = [...this.pending.values()]
    this.pending.clear()
    callbacks.forEach((callback) => callback())
  }

  get pendingCount(): number {
    return this.pending.size
  }
}

class FakeOutsideTarget extends EventTarget {
  get listenerCount(): number {
    return this.registered
  }

  private registered = 0

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.registered += 1
    super.addEventListener(type, listener, options)
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this.registered -= 1
    super.removeEventListener(type, listener, options)
  }
}

const timers = new FakeTimers()
const openedLinks: string[] = []

async function mountCard(link: ProjectLink, isTouchScreen: boolean): Promise<LinkPreviewCard> {
  const card = document.createElement('link-preview-card') as LinkPreviewCard
  card.link = link
  card.isTouchScreen = () => isTouchScreen
  card.scheduleTimer = timers.schedule
  card.cancelTimer = timers.cancel
  card.openLink = (url) => openedLinks.push(url)
  card.innerHTML = '<a class="inner-link" href="https://example.com/model">A model</a>'
  document.body.appendChild(card)
  mountedCards.push(card)
  await card.updateComplete
  return card
}

function clickInnerLink(card: LinkPreviewCard): MouseEvent {
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  card.querySelector('.inner-link')?.dispatchEvent(click)
  return click
}

function isPopupVisible(card: LinkPreviewCard): boolean {
  return card.shadowRoot?.querySelector('.card')?.classList.contains('visible') ?? false
}

afterEach(() => {
  openedLinks.length = 0
  timers.runAll()
  mountedCards.splice(0).forEach((card) => card.remove())
})

describe('link-preview-card on a touch screen', () => {
  it('shows the preview instead of following the link on the first tap', async () => {
    const card = await mountCard(LINK_WITH_PREVIEW, true)
    const click = clickInnerLink(card)
    await card.updateComplete
    expect(click.defaultPrevented).toBe(true)
    expect(isPopupVisible(card)).toBe(true)
  })

  it('lets the link open when there is nothing to preview', async () => {
    const card = await mountCard(LINK_WITHOUT_PREVIEW, true)
    const click = clickInnerLink(card)
    expect(click.defaultPrevented).toBe(false)
  })
})

describe('link-preview-card with a mouse', () => {
  it('lets the link open on click', async () => {
    const card = await mountCard(LINK_WITH_PREVIEW, false)
    const click = clickInnerLink(card)
    expect(click.defaultPrevented).toBe(false)
    expect(isPopupVisible(card)).toBe(false)
  })
})

function pressOpenLink(card: LinkPreviewCard): void {
  card.shadowRoot?.querySelector<HTMLButtonElement>('.open-button')?.click()
}

describe('link-preview-card hovering with a mouse', () => {
  it('shows the preview after a short wait, and hides it a moment after the mouse leaves', async () => {
    const card = await mountCard(LINK_WITH_PREVIEW, false)
    card.dispatchEvent(new MouseEvent('mouseenter'))
    expect(isPopupVisible(card)).toBe(false)
    timers.runAll()
    await card.updateComplete
    expect(isPopupVisible(card)).toBe(true)
    card.dispatchEvent(new MouseEvent('mouseleave'))
    timers.runAll()
    await card.updateComplete
    expect(isPopupVisible(card)).toBe(false)
  })

  it('does not show the preview when the mouse leaves before the wait is over', async () => {
    const card = await mountCard(LINK_WITH_PREVIEW, false)
    card.dispatchEvent(new MouseEvent('mouseenter'))
    card.dispatchEvent(new MouseEvent('mouseleave'))
    timers.runAll()
    await card.updateComplete
    expect(isPopupVisible(card)).toBe(false)
  })

  it('ignores hovering on a touch screen', async () => {
    const card = await mountCard(LINK_WITH_PREVIEW, true)
    card.dispatchEvent(new MouseEvent('mouseenter'))
    expect(timers.pendingCount).toBe(0)
  })
})

describe('link-preview-card opening the link', () => {
  it('opens the link through the injected opener and hides the preview', async () => {
    const card = await mountCard(LINK_WITH_PREVIEW, true)
    clickInnerLink(card)
    await card.updateComplete
    pressOpenLink(card)
    await card.updateComplete
    expect(openedLinks).toEqual(['https://example.com/model'])
    expect(isPopupVisible(card)).toBe(false)
  })
})

describe('link-preview-card tapping elsewhere', () => {
  it('hides the preview on a touch screen, listening to the injected target', async () => {
    const outside = new FakeOutsideTarget()
    const card = document.createElement('link-preview-card') as LinkPreviewCard
    card.link = LINK_WITH_PREVIEW
    card.isTouchScreen = () => true
    card.outsideClickTarget = outside
    document.body.appendChild(card)
    mountedCards.push(card)
    await card.updateComplete
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await card.updateComplete
    expect(isPopupVisible(card)).toBe(true)
    outside.dispatchEvent(new MouseEvent('click'))
    await card.updateComplete
    expect(isPopupVisible(card)).toBe(false)
  })

  it('stops listening to the target when the card leaves the page', async () => {
    const outside = new FakeOutsideTarget()
    const card = document.createElement('link-preview-card') as LinkPreviewCard
    card.link = LINK_WITH_PREVIEW
    card.outsideClickTarget = outside
    document.body.appendChild(card)
    await card.updateComplete
    expect(outside.listenerCount).toBe(1)
    card.remove()
    expect(outside.listenerCount).toBe(0)
  })
})

describe('link-preview-card describing the link', () => {
  it('shows the description of the link without markup', async () => {
    const meta = { title: 'A model', description: '<p>A <b>sturdy</b> hook</p>' }
    const card = await mountCard({ ...LINK_WITH_PREVIEW, meta }, false)
    expect(card.shadowRoot?.querySelector('.description')?.textContent).toBe('A sturdy hook')
  })
})
