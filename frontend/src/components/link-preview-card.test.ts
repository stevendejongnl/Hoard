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

async function mountCard(link: ProjectLink, isTouchScreen: boolean): Promise<LinkPreviewCard> {
  const card = document.createElement('link-preview-card') as LinkPreviewCard
  card.link = link
  card.isTouchScreen = () => isTouchScreen
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
