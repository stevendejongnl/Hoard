import { afterEach, describe, expect, it } from 'vitest'
import './system-page'
import type { SystemPage } from './system-page'
import { findVisibleSections } from './system-page'
import type { SystemReport } from '../types'

const report: SystemReport = {
  reachable: true,
  sections: [
    {
      key: 'host',
      title: 'Host',
      rows: [
        { key: 'host.model', label: 'Model', value: 'Raspberry Pi 3' },
        { key: 'host.under_voltage', label: 'Under-voltage', value: 'No' },
      ],
    },
    { key: 'network', title: 'Network', rows: [{ key: 'network.received', label: 'Received', value: '2.0 GB' }] },
    { key: 'fans', title: 'Fans', rows: [{ key: 'fans.fan', label: 'Fan', value: '50 %' }] },
  ],
  active_faults: [
    {
      key: 'klipper.shutdown',
      severity: 'error',
      source: 'Klipper',
      title: 'Klipper shutdown',
      detail: 'Timer too close',
    },
  ],
  fault_history: [
    {
      key: 'host.under_voltage',
      severity: 'error',
      source: 'Host',
      title: 'Under-voltage',
      detail: '',
      first_seen: 1_700_000_000,
      last_seen: 1_700_000_240,
      cleared_at: 1_700_000_240,
    },
  ],
  hidden: [],
}

interface Environment {
  saved: string[][]
  ticks: (() => void)[]
  stopped: number
}

async function settle(page: SystemPage): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
}

async function createPage(
  answer: SystemReport | Error = report,
): Promise<{ page: SystemPage; environment: Environment }> {
  const environment: Environment = { saved: [], ticks: [], stopped: 0 }
  const page = document.createElement('system-page') as SystemPage
  page.loadSystem = async () => {
    if (answer instanceof Error) throw answer
    return answer
  }
  page.saveHiddenRows = async (keys) => void environment.saved.push(keys)
  page.repeatEvery = (callback) => {
    environment.ticks.push(callback)
    return () => void (environment.stopped += 1)
  }
  document.body.appendChild(page)
  await settle(page)
  return { page, environment }
}

function readText(page: SystemPage, selector: string): string {
  return page.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

async function openPage(page: SystemPage, name: string): Promise<void> {
  const items = [...page.querySelectorAll<HTMLButtonElement>('.system-list-item')]
  items.find((item) => item.textContent?.includes(name))!.click()
  await settle(page)
}

async function openHistory(page: SystemPage): Promise<void> {
  await openPage(page, 'Faults')
  page.querySelector<HTMLButtonElement>('.fault-history-toggle')!.click()
  await settle(page)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('findVisibleSections', () => {
  it('leaves out hidden rows and hidden sections, and a section with no rows left', () => {
    expect(findVisibleSections(report.sections, ['fans']).map((section) => section.key)).toEqual(['host', 'network'])
    const [host] = findVisibleSections(report.sections, ['host.model'])
    expect(host.rows.map((row) => row.key)).toEqual(['host.under_voltage'])
    expect(findVisibleSections(report.sections, ['fans.fan']).map((section) => section.key)).toEqual([
      'host',
      'network',
    ])
  })
})

describe('system page', () => {
  it('opens on the host, with the network that belongs to it', async () => {
    const { page } = await createPage()
    expect(readText(page, '[data-section="host"]')).toContain('Raspberry Pi 3')
    expect(readText(page, '[data-row="network.received"]')).toContain('2.0 GB')
  })

  it('shows what the printer reports on the page it belongs to', async () => {
    const { page } = await createPage()
    expect(page.querySelector('[data-row="fans.fan"]')).toBeNull()
    await openPage(page, 'Temperatures')
    expect(readText(page, '[data-row="fans.fan"]')).toContain('50 %')
    expect(page.querySelector('[data-section="host"]')).toBeNull()
  })

  it('lists the pages under their headings, with Faults first and the settings last', async () => {
    const { page } = await createPage()
    const items = [...page.querySelectorAll('.system-list-item')].map((item) => item.textContent?.trim())
    expect(items[0]).toContain('Faults')
    expect(items.slice(1).map((text) => text?.replace(/\d+$/, '').trim())).toEqual([
      'Host',
      'Temperatures',
      'Failure detection',
    ])
    const headings = [...page.querySelectorAll('.system-list-heading')].map((heading) => heading.textContent?.trim())
    expect(headings).toEqual(['Computer', 'Printer', 'Settings'])
  })

  it('draws an icon on every page of the list, Faults and detection too', async () => {
    const { page } = await createPage()
    const items = [...page.querySelectorAll('.system-list-item')]
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.querySelector('.system-list-icon svg') !== null)).toBe(true)
  })

  it('marks the open page', async () => {
    const { page } = await createPage()
    expect(page.querySelector('.system-list-item.selected')?.textContent).toContain('Host')
    await openPage(page, 'Temperatures')
    expect(page.querySelector('.system-list-item.selected')?.textContent).toContain('Temperatures')
  })

  it('shows the number of active faults next to Faults', async () => {
    const { page } = await createPage()
    expect(readText(page, '.system-list-item')).toContain('1')
  })

  it('shows the active faults with the reason', async () => {
    const { page } = await createPage()
    await openPage(page, 'Faults')
    expect(readText(page, '.active-fault')).toContain('Timer too close')
  })

  it('says so when nothing is wrong', async () => {
    const { page } = await createPage({ ...report, active_faults: [] })
    await openPage(page, 'Faults')
    expect(readText(page, '.system-faults')).toContain('No active faults')
  })

  it('shows the history with how long a fault lasted', async () => {
    const { page } = await createPage()
    await openHistory(page)
    expect(readText(page, '.fault-history-row')).toContain('Under-voltage')
    expect(readText(page, '.fault-history-row')).toContain('0h 4m')
  })

  it('shows a fault that has not cleared as ongoing', async () => {
    const [cleared] = report.fault_history
    const { page } = await createPage({ ...report, fault_history: [{ ...cleared, cleared_at: null }] })
    await openHistory(page)
    expect(readText(page, '.fault-history-row')).toContain('ongoing')
  })

  it('leaves out what was hidden on the server, and a page that has nothing left', async () => {
    const { page } = await createPage({ ...report, hidden: ['fans', 'host.model'] })
    expect(page.querySelector('[data-row="host.model"]')).toBeNull()
    expect(
      [...page.querySelectorAll('.system-list-item')].some((item) => item.textContent?.includes('Temperatures')),
    ).toBe(false)
  })

  it('refreshes on the timer and stops when it leaves the page', async () => {
    let loads = 0
    const { page, environment } = await createPage()
    page.loadSystem = async () => {
      loads += 1
      return report
    }
    environment.ticks[0]()
    await settle(page)
    expect(loads).toBe(1)
    page.remove()
    expect(environment.stopped).toBe(1)
  })

  it('says when the page could not be loaded', async () => {
    const { page } = await createPage(new Error('down'))
    expect(readText(page, '.state-message')).toContain('Could not load')
  })
})

describe('fault history', () => {
  it('is out of the way until it is asked for', async () => {
    const { page } = await createPage()
    await openPage(page, 'Faults')
    expect(page.querySelector('.fault-history-row')).toBeNull()
    expect(readText(page, '.fault-history-toggle')).toContain('History')
  })

  it('opens and closes on the toggle', async () => {
    const { page } = await createPage()
    await openHistory(page)
    expect(page.querySelector('.fault-history-row')).not.toBeNull()
    page.querySelector<HTMLButtonElement>('.fault-history-toggle')!.click()
    await settle(page)
    expect(page.querySelector('.fault-history-row')).toBeNull()
  })

  it('has no toggle when nothing ever went wrong', async () => {
    const { page } = await createPage({ ...report, fault_history: [] })
    await openPage(page, 'Faults')
    expect(page.querySelector('.fault-history-toggle')).toBeNull()
  })
})

describe('failure detection on the system page', () => {
  it('has its settings form on a page of its own', async () => {
    const { page } = await createPage()
    expect(page.querySelector('detection-settings')).toBeNull()
    await openPage(page, 'Failure detection')
    expect(page.querySelector('.system-pane detection-settings')).not.toBeNull()
  })
})

describe('on a phone', () => {
  it('opens a page from the list and goes back to the list', async () => {
    const { page } = await createPage()
    expect(page.querySelector('.system-body')?.hasAttribute('data-open')).toBe(false)
    await openPage(page, 'Temperatures')
    expect(page.querySelector('.system-body')?.hasAttribute('data-open')).toBe(true)
    page.querySelector<HTMLButtonElement>('.system-back')!.click()
    await settle(page)
    expect(page.querySelector('.system-body')?.hasAttribute('data-open')).toBe(false)
  })
})

describe('nothing to choose', () => {
  it('offers no Choose rows when the host reports nothing', async () => {
    const { page } = await createPage({ ...report, reachable: false, sections: [] })
    expect(page.querySelector('.choose-rows-button')).toBeNull()
    expect(page.querySelector('.system-strip')).not.toBeNull()
  })
})

describe('choosing rows', () => {
  async function startChoosing(): Promise<{ page: SystemPage; environment: Environment }> {
    const created = await createPage({ ...report, hidden: ['fans.fan'] })
    created.page.querySelector<HTMLButtonElement>('.choose-rows-button')!.click()
    await settle(created.page)
    return created
  }

  it('lists every section on one page, so they can all be chosen', async () => {
    const { page } = await startChoosing()
    expect(page.querySelector('.system-list')).toBeNull()
    expect(page.querySelector('[data-section="fans"]')).not.toBeNull()
  })

  it('shows hidden rows again, unticked, so they can come back', async () => {
    const { page } = await startChoosing()
    const box = page.querySelector<HTMLInputElement>('[data-row="fans.fan"] input[type="checkbox"]')
    expect(box?.checked).toBe(false)
  })

  it('saves on the server when a row is hidden', async () => {
    const { page, environment } = await startChoosing()
    page.querySelector<HTMLInputElement>('[data-row="host.model"] input[type="checkbox"]')!.click()
    await settle(page)
    expect(environment.saved).toEqual([['fans.fan', 'host.model']])
  })

  it('saves on the server when a row comes back', async () => {
    const { page, environment } = await startChoosing()
    page.querySelector<HTMLInputElement>('[data-row="fans.fan"] input[type="checkbox"]')!.click()
    await settle(page)
    expect(environment.saved).toEqual([[]])
  })

  it('can hide a whole section', async () => {
    const { page, environment } = await startChoosing()
    page.querySelector<HTMLInputElement>('[data-section="host"] .section-toggle')!.click()
    await settle(page)
    expect(environment.saved).toEqual([['fans.fan', 'host']])
  })
})
