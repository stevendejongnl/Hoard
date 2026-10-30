import { afterEach, describe, expect, it } from 'vitest'
import './bottom-tabs'
import type { BottomTabs } from './bottom-tabs'
import './top-navigation'
import type { TopNavigation } from './top-navigation'

afterEach(() => {
  document.body.replaceChildren()
})

async function createTabs(faultCount: number): Promise<BottomTabs> {
  const tabs = document.createElement('bottom-tabs') as BottomTabs
  tabs.faultCount = faultCount
  document.body.appendChild(tabs)
  await tabs.updateComplete
  return tabs
}

describe('the System tab', () => {
  it('is in the phone tabs', async () => {
    const tabs = await createTabs(0)
    expect(tabs.querySelector('a[href="/system"]')?.textContent).toContain('System')
  })

  it('counts the active faults on the phone', async () => {
    const tabs = await createTabs(2)
    expect(tabs.querySelector('a[href="/system"] .fault-count')?.textContent).toBe('2')
    expect(tabs.querySelectorAll('.fault-count')).toHaveLength(1)
  })

  it('shows no count without faults', async () => {
    const tabs = await createTabs(0)
    expect(tabs.querySelector('.fault-count')).toBeNull()
  })

  it('counts the active faults in the top bar', async () => {
    const navigation = document.createElement('top-navigation') as TopNavigation
    navigation.faultCount = 3
    document.body.appendChild(navigation)
    await navigation.updateComplete
    expect(navigation.querySelector('a[href="/system"] .fault-count')?.textContent).toBe('3')
  })
})
