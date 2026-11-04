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

async function chooseTab(page: SystemPage, name: string): Promise<void> {
  const tabs = [...page.querySelectorAll<HTMLButtonElement>('.system-tab')]
  tabs.find((tab) => tab.textContent?.trim() === name)!.click()
  await settle(page)
}

async function openHistory(page: SystemPage): Promise<void> {
  page.querySelector<HTMLButtonElement>('.fault-history-toggle')!.click()
  await settle(page)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('findVisibleSections', () => {
  it('leaves out hidden rows and hidden sections, and a section with no rows left', () => {
    expect(findVisibleSections(report.sections, ['fans']).map((section) => section.key)).toEqual(['host'])
    const [host] = findVisibleSections(report.sections, ['host.model'])
    expect(host.rows.map((row) => row.key)).toEqual(['host.under_voltage'])
    expect(findVisibleSections(report.sections, ['fans.fan']).map((section) => section.key)).toEqual(['host'])
  })
})

describe('system page', () => {
  it('shows what the host reports, whatever it is', async () => {
    const { page } = await createPage()
    expect(readText(page, '[data-section="host"]')).toContain('Raspberry Pi 3')
    await chooseTab(page, 'Fans')
    expect(readText(page, '[data-row="fans.fan"]')).toContain('50 %')
  })

  it('shows the active faults first, with the reason', async () => {
    const { page } = await createPage()
    expect(
      page.querySelector('.system-faults')?.compareDocumentPosition(page.querySelector('[data-section="host"]')!),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(readText(page, '.active-fault')).toContain('Timer too close')
  })

  it('says so when nothing is wrong', async () => {
    const { page } = await createPage({ ...report, active_faults: [] })
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

  it('leaves out what was hidden on the server', async () => {
    const { page } = await createPage({ ...report, hidden: ['fans', 'host.model'] })
    expect(page.querySelector('[data-section="fans"]')).toBeNull()
    expect(page.querySelector('[data-row="host.model"]')).toBeNull()
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

describe('failure detection on the system page', () => {
  it('has its settings form between the faults and the sections', async () => {
    const { page } = await createPage()
    await chooseTab(page, 'Detection')
    expect(page.querySelector('.system-tabs ~ detection-settings')).not.toBeNull()
  })
})

describe('tabs', () => {
  it('has a tab for every section that is shown, and one for failure detection', async () => {
    const { page } = await createPage()
    const names = [...page.querySelectorAll('.system-tab')].map((tab) => tab.textContent?.trim())
    expect(names).toEqual(['Host', 'Fans', 'Detection'])
  })

  it('opens the first section and keeps the others out of the page', async () => {
    const { page } = await createPage()
    expect(page.querySelector('[data-section="host"]')).not.toBeNull()
    expect(page.querySelector('[data-section="fans"]')).toBeNull()
    expect(page.querySelector('detection-settings')).toBeNull()
  })

  it('shows the section of the chosen tab and marks the tab', async () => {
    const { page } = await createPage()
    await chooseTab(page, 'Fans')
    expect(page.querySelector('[data-section="host"]')).toBeNull()
    expect(page.querySelector('[data-section="fans"]')).not.toBeNull()
    expect(page.querySelector('.system-tab.selected')?.textContent?.trim()).toBe('Fans')
  })

  it('has no tab for a section that was hidden', async () => {
    const { page } = await createPage({ ...report, hidden: ['fans'] })
    expect(page.querySelectorAll('.system-tab')[1]?.textContent?.trim()).toBe('Detection')
  })

  it('shows every section again, without tabs, while rows are chosen', async () => {
    const { page } = await createPage()
    page.querySelector<HTMLButtonElement>('.choose-rows-button')!.click()
    await settle(page)
    expect(page.querySelector('.system-tabs')).toBeNull()
    expect(page.querySelector('[data-section="fans"]')).not.toBeNull()
  })
})

describe('fault history', () => {
  it('is out of the way until it is asked for', async () => {
    const { page } = await createPage()
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
    expect(page.querySelector('.fault-history-toggle')).toBeNull()
  })
})
