import { afterEach, describe, expect, it } from 'vitest'
import { html } from 'lit'
import './control-page'
import type { ControlPage } from './control-page'
import type { ControlLayout } from '../control-layout'
import { DEFAULT_LAYOUT } from '../control-layout'
import type { ControlDevice, ControlStatus } from '../types'

const STATUS: ControlStatus = {
  state: 'standby',
  locked: false,
  position: { x: 120, y: 110, z: 24.4 },
  homed: 'xyz',
  heaters: [],
  speed_percent: 100,
  flow_percent: 100,
  z_offset: 0,
  manual_probe: { active: false, z: null },
  fans: [],
}

const ALL = DEFAULT_LAYOUT.order

interface ScheduledSave {
  callback: () => void
  isCancelled: boolean
}

interface Setup {
  page: ControlPage
  saved: Array<{ device: ControlDevice; layout: ControlLayout }>
  resets: ControlDevice[]
  scheduled: ScheduledSave[]
  loaded: ControlDevice[]
  refreshes: { count: number }
}

async function settle(page: ControlPage): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
}

async function createPage(
  options: {
    layout?: unknown
    status?: ControlStatus
    device?: ControlDevice
    loadStatus?: () => Promise<ControlStatus>
  } = {},
): Promise<Setup> {
  const saved: Setup['saved'] = []
  const resets: ControlDevice[] = []
  const scheduled: ScheduledSave[] = []
  const loaded: ControlDevice[] = []
  const refreshes = { count: 0 }
  const page = document.createElement('control-page') as ControlPage
  page.loadStatus =
    options.loadStatus ??
    (async () => {
      refreshes.count += 1
      return options.status ?? STATUS
    })
  page.loadLayout = async (device) => {
    loaded.push(device)
    return options.layout ?? null
  }
  page.saveLayout = async (device, layout) => {
    saved.push({ device, layout })
    return layout
  }
  page.resetLayout = async (device) => {
    resets.push(device)
    return { ok: true }
  }
  page.readDevice = () => options.device ?? 'desktop'
  page.repeatEvery = () => () => undefined
  page.scheduleSave = (callback) => {
    const entry = { callback, isCancelled: false }
    scheduled.push(entry)
    return () => void (entry.isCancelled = true)
  }
  page.renderCard = (key) => html`<p class="fake-card">${key}</p>`
  page.renderCameraFocus = (_context, close) =>
    html`<div class="fake-focus"><button @click=${close}>Close fake</button></div>`
  document.body.appendChild(page)
  await settle(page)
  return { page, saved, resets, scheduled, loaded, refreshes }
}

async function endPause(setup: Setup): Promise<void> {
  setup.scheduled.filter((entry) => !entry.isCancelled).forEach((entry) => entry.callback())
  await settle(setup.page)
}

function shownCards(page: ControlPage): string[] {
  return [...page.querySelectorAll('[data-card]')].map((slot) => slot.getAttribute('data-card') as string)
}

function slot(page: ControlPage, key: string): HTMLElement {
  return page.querySelector(`[data-card="${key}"]`) as HTMLElement
}

function pressButton(root: ParentNode, label: string): void {
  const button = [...root.querySelectorAll('button')].find(
    (candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()) === label,
  )
  if (!button) throw new Error(`no button "${label}"`)
  button.click()
}

function hasButton(root: ParentNode, label: string): boolean {
  return [...root.querySelectorAll('button')].some(
    (candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()) === label,
  )
}

async function pressAndSettle(setup: Setup, root: ParentNode, label: string): Promise<void> {
  pressButton(root, label)
  await settle(setup.page)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the control page', () => {
  it('shows all nine cards in the default order when nothing was stored', async () => {
    const { page } = await createPage()
    expect(shownCards(page)).toEqual(ALL)
  })

  it('loads the layout of the device it is on', async () => {
    const desktop = await createPage({ device: 'desktop' })
    const phone = await createPage({ device: 'phone' })
    expect(desktop.loaded).toEqual(['desktop'])
    expect(phone.loaded).toEqual(['phone'])
  })

  it('shows the stored order, spans and hidden cards', async () => {
    const layout = { order: ['console', 'camera'], spans: { camera: 2 }, hidden: ['move'] }
    const { page } = await createPage({ layout })
    expect(shownCards(page).slice(0, 2)).toEqual(['console', 'camera'])
    expect(shownCards(page)).not.toContain('move')
    expect(slot(page, 'camera').style.gridColumn).toBe('span 2')
    expect(slot(page, 'console').style.gridColumn).toBe('span 1')
  })

  it('still shows the default cards when the layout cannot be loaded', async () => {
    const page = document.createElement('control-page') as ControlPage
    page.loadStatus = async () => STATUS
    page.loadLayout = async () => {
      throw new Error('offline')
    }
    page.readDevice = () => 'desktop'
    page.repeatEvery = () => () => undefined
    page.renderCard = (key) => html`<p>${key}</p>`
    document.body.appendChild(page)
    await settle(page)
    expect(shownCards(page)).toEqual(ALL)
  })

  it('hands every card to the card renderer', async () => {
    const { page } = await createPage()
    expect(page.querySelectorAll('.fake-card')).toHaveLength(9)
  })
})

describe('the list on the left', () => {
  it('has Everything and the cards under the headings Move, Heat and Tools', async () => {
    const { page } = await createPage()
    const list = page.querySelector('.control-list') as HTMLElement
    expect([...list.querySelectorAll('.control-list-heading')].map((heading) => heading.textContent?.trim())).toEqual([
      'Move',
      'Heat',
      'Tools',
    ])
    expect([...list.querySelectorAll('.control-list-item')].map((item) => item.textContent?.trim())).toEqual([
      'Everything',
      'Camera',
      'Move and home',
      'Extruder',
      'Temperatures',
      'Speed, flow and fans',
      'Bed mesh',
      'Calibration',
      'Macros',
      'Console',
    ])
  })

  it('shows one group when its heading is pressed', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Tools')
    expect(shownCards(setup.page)).toEqual(['bed_mesh', 'calibration', 'macros', 'console'])
  })

  it('shows one card when it is pressed, and everything again with Everything', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Macros')
    expect(shownCards(setup.page)).toEqual(['macros'])
    await pressAndSettle(setup, setup.page, 'Everything')
    expect(shownCards(setup.page)).toEqual(ALL)
  })

  it('marks the open item', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Macros')
    const selected = [...setup.page.querySelectorAll('.control-list-item.selected')]
    expect(selected.map((item) => item.textContent?.trim())).toEqual(['Macros'])
  })

  it('has the groups as a row of filters for the phone', async () => {
    const setup = await createPage({ device: 'phone' })
    const filters = [...setup.page.querySelectorAll('.control-filter button')]
    expect(filters.map((filter) => filter.textContent?.trim())).toEqual(['All', 'Move', 'Heat', 'Tools'])
    await pressAndSettle(setup, setup.page.querySelector('.control-filter') as HTMLElement, 'Heat')
    expect(shownCards(setup.page)).toEqual(['temperatures', 'tuning'])
  })
})

describe('the lock while printing', () => {
  it('says the printer is idle and gives the cards no lock', async () => {
    const { page } = await createPage()
    expect(page.textContent).toContain('Printer idle')
    expect(page.querySelector('.control-locked-note')).toBeNull()
  })

  it('says what is locked while the printer prints', async () => {
    const { page } = await createPage({ status: { ...STATUS, state: 'printing', locked: true } })
    expect(page.textContent).toContain('Printing')
    expect(page.querySelector('.control-locked-note')?.textContent).toContain('locked')
  })

  it('says so when the printer cannot be reached, and leaves the cards locked', async () => {
    const { page } = await createPage({
      loadStatus: async () => {
        throw new Error('502')
      },
    })
    expect(page.textContent).toContain('Printer not reachable')
  })
})

describe('editing the layout', () => {
  it('shows no edit controls until Edit layout is pressed', async () => {
    const { page } = await createPage()
    expect(page.querySelector('.control-edit-bar')).toBeNull()
  })

  it('shows an edit bar on every card, and Done in place of Edit layout', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    expect(setup.page.querySelectorAll('.control-edit-bar')).toHaveLength(9)
    expect(hasButton(setup.page, 'Done')).toBe(true)
    expect(hasButton(setup.page, 'Edit layout')).toBe(false)
    await pressAndSettle(setup, setup.page, 'Done')
    expect(setup.page.querySelector('.control-edit-bar')).toBeNull()
  })

  it('has no Save button, because a change is saved by itself', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    expect(hasButton(setup.page, 'Save')).toBe(false)
  })

  it('moves a card up and down', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, slot(setup.page, 'move'), 'Move Move and home up')
    expect(shownCards(setup.page).slice(0, 2)).toEqual(['move', 'camera'])
    await pressAndSettle(setup, slot(setup.page, 'move'), 'Move Move and home down')
    expect(shownCards(setup.page).slice(0, 2)).toEqual(['camera', 'move'])
  })

  it('has no way up for the first card and no way down for the last', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    expect(
      (slot(setup.page, 'camera').querySelector('[aria-label="Move Camera up"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (slot(setup.page, 'console').querySelector('[aria-label="Move Console down"]') as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('moves a card by dragging it onto another one', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    slot(setup.page, 'console').dispatchEvent(new Event('dragstart', { bubbles: true }))
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    slot(setup.page, 'camera').dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    slot(setup.page, 'camera').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    await settle(setup.page)
    expect(shownCards(setup.page).slice(0, 2)).toEqual(['console', 'camera'])
  })

  it('lets a card be dragged only while editing', async () => {
    const setup = await createPage()
    expect(slot(setup.page, 'camera').draggable).toBe(false)
    await pressAndSettle(setup, setup.page, 'Edit layout')
    expect(slot(setup.page, 'camera').draggable).toBe(true)
  })

  it('sets how many columns a card spans', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, slot(setup.page, 'camera'), 'Camera spans 3 columns')
    expect(slot(setup.page, 'camera').style.gridColumn).toBe('span 3')
    const pressed = slot(setup.page, 'camera').querySelector('[aria-pressed="true"]')
    expect(pressed?.getAttribute('aria-label')).toBe('Camera spans 3 columns')
  })

  it('hides a card, lists it in the tray, and puts it back at the end', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, slot(setup.page, 'macros'), 'Hide Macros')
    expect(shownCards(setup.page)).not.toContain('macros')
    const tray = setup.page.querySelector('.control-hidden-tray') as HTMLElement
    expect(tray.textContent).toContain('Macros')
    await pressAndSettle(setup, tray, 'Show Macros')
    expect(shownCards(setup.page).at(-1)).toBe('macros')
  })

  it('has no tray while no card is hidden', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    expect(setup.page.querySelector('.control-hidden-tray')).toBeNull()
  })

  it('goes back to the default layout with Reset layout, and forgets the stored one', async () => {
    const setup = await createPage({ layout: { order: ['console'], spans: { console: 3 }, hidden: ['camera'] } })
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, setup.page, 'Reset layout')
    expect(shownCards(setup.page)).toEqual(ALL)
    expect(slot(setup.page, 'console').style.gridColumn).toBe('span 1')
    expect(setup.resets).toEqual(['desktop'])
    await endPause(setup)
    expect(setup.saved).toEqual([])
  })

  it('shows the edit controls of a card in the same way on the phone', async () => {
    const setup = await createPage({ device: 'phone' })
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, slot(setup.page, 'move'), 'Move Move and home up')
    expect(shownCards(setup.page).slice(0, 2)).toEqual(['move', 'camera'])
  })
})

describe('saving the layout', () => {
  it('saves a change after a pause, for the device it is on, and says so', async () => {
    const setup = await createPage({ device: 'phone' })
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, slot(setup.page, 'camera'), 'Camera spans 2 columns')
    expect(setup.saved).toEqual([])
    await endPause(setup)
    expect(setup.saved).toHaveLength(1)
    expect(setup.saved[0].device).toBe('phone')
    expect(setup.saved[0].layout.spans).toEqual({ camera: 2 })
    expect(setup.page.textContent).toContain('Saved')
  })

  it('makes one save of several changes made before the pause is over', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, slot(setup.page, 'camera'), 'Camera spans 2 columns')
    await pressAndSettle(setup, slot(setup.page, 'move'), 'Hide Move and home')
    await endPause(setup)
    expect(setup.saved).toHaveLength(1)
    expect(setup.saved[0].layout.hidden).toEqual(['move'])
  })

  it('says so when saving fails, and keeps the layout on screen', async () => {
    const setup = await createPage()
    setup.page.saveLayout = async () => {
      throw new Error('500')
    }
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, slot(setup.page, 'macros'), 'Hide Macros')
    await endPause(setup)
    expect(setup.page.textContent).toContain('Could not save the layout')
    expect(shownCards(setup.page)).not.toContain('macros')
  })

  it('saves what was changed when the page is left before the pause is over', async () => {
    const setup = await createPage()
    await pressAndSettle(setup, setup.page, 'Edit layout')
    await pressAndSettle(setup, slot(setup.page, 'macros'), 'Hide Macros')
    setup.page.remove()
    await settle(setup.page)
    expect(setup.saved).toHaveLength(1)
  })

  it('saves nothing when nothing was changed', async () => {
    const setup = await createPage()
    setup.page.remove()
    await settle(setup.page)
    expect(setup.saved).toEqual([])
  })
})

describe('keeping the status fresh', () => {
  it('reads the status when it opens, and again when a card has sent a command', async () => {
    const setup = await createPage()
    expect(setup.refreshes.count).toBe(1)
    slot(setup.page, 'move').dispatchEvent(new CustomEvent('control-changed', { bubbles: true }))
    await settle(setup.page)
    expect(setup.refreshes.count).toBe(2)
  })

  it('reads it again on every tick of the timer, and stops when the page is left', async () => {
    let tick: () => void = () => undefined
    let stopped = false
    const page = document.createElement('control-page') as ControlPage
    let reads = 0
    page.loadStatus = async () => {
      reads += 1
      return STATUS
    }
    page.loadLayout = async () => null
    page.readDevice = () => 'desktop'
    page.renderCard = () => html``
    page.repeatEvery = (callback) => {
      tick = callback
      return () => (stopped = true)
    }
    document.body.appendChild(page)
    await settle(page)
    tick()
    await settle(page)
    expect(reads).toBe(2)
    page.remove()
    expect(stopped).toBe(true)
  })
})

describe('the camera on a screen of its own', () => {
  it('is not there until a card asks for it', async () => {
    const { page } = await createPage()
    expect(page.querySelector('.fake-focus')).toBeNull()
  })

  it('opens when the camera card asks, and closes when it is closed', async () => {
    const setup = await createPage()
    slot(setup.page, 'camera').dispatchEvent(new CustomEvent('control-camera-focus', { bubbles: true }))
    await settle(setup.page)
    expect(setup.page.querySelector('.fake-focus')).not.toBeNull()
    await pressAndSettle(setup, setup.page, 'Close fake')
    expect(setup.page.querySelector('.fake-focus')).toBeNull()
  })
})
