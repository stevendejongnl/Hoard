import { afterEach, describe, expect, it } from 'vitest'
import type { TagRecord } from '../spool-tag-formats'
import type { Spool } from '../types'
import './spools-page'
import type { SpoolsPage } from './spools-page'

function createSpool(overrides: Partial<Spool> = {}): Spool {
  return {
    id: 1,
    brand: 'Sunlu',
    material: 'PLA Plus',
    color: 'White',
    color_hex: '#F8FAFC',
    cost_per_gram: 0.01,
    initial_weight_g: 1000,
    current_weight_g: 840,
    notes: null,
    active: 1,
    created_at: 0,
    ...overrides,
  }
}

const fixtureSpools = [
  createSpool(),
  createSpool({ id: 2, brand: 'eSUN', material: 'PLA', color: 'Black', current_weight_g: 612, active: 0 }),
  createSpool({ id: 3, brand: 'Generic', material: 'PETG', color: 'Grey', current_weight_g: 310, active: 0 }),
]

interface Calls {
  created: Partial<Spool>[]
  updated: { id: number; data: Partial<Spool> }[]
  deleted: number[]
  confirmations: string[]
}

function createCalls(): Calls {
  return { created: [], updated: [], deleted: [], confirmations: [] }
}

async function createSpoolsPage(
  calls: Calls,
  properties: Partial<SpoolsPage> = {},
  spools: Spool[] = fixtureSpools,
): Promise<SpoolsPage> {
  const page = document.createElement('spools-page') as SpoolsPage
  page.loadSpools = async () => spools
  page.createSpool = async (data) => {
    calls.created.push(data)
    return createSpool({ id: 9, ...data })
  }
  page.updateSpool = async (id, data) => {
    calls.updated.push({ id, data })
    return createSpool({ id, ...data })
  }
  page.deleteSpool = async (id) => {
    calls.deleted.push(id)
    return { ok: true, status: 200 }
  }
  page.confirmAction = (message) => {
    calls.confirmations.push(message)
    return true
  }
  Object.assign(page, properties)
  document.body.appendChild(page)
  await settle(page)
  return page
}

async function settle(page: SpoolsPage): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.updateComplete
}

function findRows(page: SpoolsPage): HTMLElement[] {
  return [...page.querySelectorAll<HTMLElement>('.spool-row')]
}

function readNames(page: SpoolsPage): (string | undefined)[] {
  return findRows(page).map((row) => row.querySelector('.spool-name')?.textContent?.trim())
}

function findInput(page: SpoolsPage, name: string): HTMLInputElement {
  return page.querySelector<HTMLInputElement>(`[name="${name}"]`)!
}

async function type(page: SpoolsPage, name: string, value: string): Promise<void> {
  const input = findInput(page, name)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await page.updateComplete
}

async function choose(page: SpoolsPage, label: string, value: string): Promise<void> {
  const select = page.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await page.updateComplete
}

async function click(page: SpoolsPage, selector: string): Promise<void> {
  page.querySelector<HTMLElement>(selector)!.click()
  await settle(page)
}

function readSummary(page: SpoolsPage, key: string): string | undefined {
  return page.querySelector(`[data-summary="${key}"]`)?.textContent?.trim()
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('spool list', () => {
  it('shows one row per spool named from brand and material', async () => {
    expect(readNames(await createSpoolsPage(createCalls()))).toEqual(['Sunlu PLA Plus', 'eSUN PLA', 'Generic PETG'])
  })

  it('shows material, colour, remaining grams and the cost per gram', async () => {
    const row = findRows(await createSpoolsPage(createCalls()))[0]
    expect(row.textContent).toContain('PLA+')
    expect(row.textContent).toContain('White')
    expect(row.textContent).toContain('840 / 1000 g')
    expect(row.textContent).toContain('€0.010')
  })

  it('tags only the spool in use', async () => {
    const rows = findRows(await createSpoolsPage(createCalls()))
    expect(rows.map((row) => row.querySelector('.in-use-tag') !== null)).toEqual([true, false, false])
  })

  it('selects the first spool at the start', async () => {
    const rows = findRows(await createSpoolsPage(createCalls()))
    expect(rows.map((row) => row.classList.contains('selected'))).toEqual([true, false, false])
  })

  it('shows the count of spools next to the title', async () => {
    expect((await createSpoolsPage(createCalls())).querySelector('.spools-count')?.textContent).toBe('3')
  })
})

describe('filters and summary', () => {
  it('sums the spools, the spools in use and the filament left', async () => {
    const page = await createSpoolsPage(createCalls())
    expect([readSummary(page, 'spools'), readSummary(page, 'in-use'), readSummary(page, 'filament-left')]).toEqual([
      '3',
      '1',
      '1762g',
    ])
  })

  it('offers the materials that exist', async () => {
    const page = await createSpoolsPage(createCalls())
    const options = [...page.querySelectorAll<HTMLOptionElement>('select[aria-label="Material"] option')]
    expect(options.map((option) => option.value)).toEqual(['', 'PETG', 'PLA', 'PLA Plus'])
  })

  it('filters by material and updates the summary', async () => {
    const page = await createSpoolsPage(createCalls())
    await choose(page, 'Material', 'PLA')
    expect(readNames(page)).toEqual(['eSUN PLA'])
    expect(readSummary(page, 'filament-left')).toBe('612g')
  })

  it('filters on spools in use', async () => {
    const page = await createSpoolsPage(createCalls())
    await choose(page, 'Show', 'in-use')
    expect(readNames(page)).toEqual(['Sunlu PLA Plus'])
  })

  it('says so when no spool matches the filters', async () => {
    const page = await createSpoolsPage(createCalls())
    await choose(page, 'Material', 'PLA')
    await choose(page, 'Show', 'in-use')
    expect(page.querySelector('.state-message')?.textContent).toContain('No spools match the filters')
  })
})

describe('loading, empty and error states', () => {
  it('shows a loading message until the spools arrive', async () => {
    const page = document.createElement('spools-page') as SpoolsPage
    page.loadSpools = () => new Promise<Spool[]>(() => {})
    document.body.appendChild(page)
    await page.updateComplete
    expect(page.querySelector('.state-message')?.textContent).toContain('Loading spools')
  })

  it('shows a message when there are no spools', async () => {
    const page = await createSpoolsPage(createCalls(), {}, [])
    expect(page.querySelector('.state-message')?.textContent).toContain('No spools yet')
  })

  it('shows an error when loading fails', async () => {
    const page = await createSpoolsPage(createCalls(), {
      loadSpools: async () => {
        throw new Error('500 Internal Server Error')
      },
    })
    expect(page.querySelector('.state-message')?.textContent).toContain('Could not load spools')
  })
})

describe('edit form', () => {
  it('fills from the selected spool', async () => {
    const page = await createSpoolsPage(createCalls())
    expect(
      ['brand', 'material', 'color', 'colorHex', 'initialWeight', 'currentWeight', 'costPerGram'].map(
        (name) => findInput(page, name).value,
      ),
    ).toEqual(['Sunlu', 'PLA+', 'White', '#F8FAFC', '1000', '840', '0.010'])
  })

  it('fills from another spool when its row is clicked', async () => {
    const page = await createSpoolsPage(createCalls())
    findRows(page)[1].click()
    await page.updateComplete
    expect(findInput(page, 'brand').value).toBe('eSUN')
    expect(findRows(page).map((row) => row.classList.contains('selected'))).toEqual([false, true, false])
  })

  it('fills from a spool when its edit button is pressed', async () => {
    const page = await createSpoolsPage(createCalls())
    await click(page, 'button[aria-label="Edit Generic PETG"]')
    expect(findInput(page, 'brand').value).toBe('Generic')
  })

  it('shows the colour of the hex field as a swatch', async () => {
    const page = await createSpoolsPage(createCalls())
    await type(page, 'colorHex', '#112233')
    expect(page.querySelector<HTMLElement>('.hex-swatch')?.style.background).toBe('rgb(17, 34, 51)')
  })
})

describe('edit sheet on a phone', () => {
  it('has no backdrop while the form is closed', async () => {
    const page = await createSpoolsPage(createCalls())
    expect(page.querySelector('.sheet-backdrop')).toBeNull()
  })

  it('dims the list behind the form while it is open and closes when the backdrop is pressed', async () => {
    const page = await createSpoolsPage(createCalls())
    await click(page, '.edit-spool-button')
    expect(page.querySelector('.sheet-backdrop')).not.toBeNull()
    await click(page, '.sheet-backdrop')
    expect(page.querySelector('.sheet-backdrop')).toBeNull()
    expect(page.querySelector('.spools-details')?.classList.contains('open')).toBe(false)
  })
})

describe('saving', () => {
  it('updates the selected spool with the edited values', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls)
    await type(page, 'currentWeight', '800')
    await click(page, '.save-button')
    expect(calls.updated).toHaveLength(1)
    expect(calls.updated[0].id).toBe(1)
    expect(calls.updated[0].data).toMatchObject({ current_weight_g: 800, material: 'PLA Plus', color_hex: '#f8fafc' })
  })

  it('does not save invalid numbers and says why', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls)
    await type(page, 'initialWeight', 'lots')
    await click(page, '.save-button')
    expect(calls.updated).toEqual([])
    expect(page.querySelector('.form-error')?.textContent).toContain('Initial weight must be a number above zero')
  })

  it('does not save an invalid colour hex', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls)
    await type(page, 'colorHex', 'nope')
    await click(page, '.save-button')
    expect(calls.updated).toEqual([])
    expect(page.querySelector('.form-error')?.textContent).toContain('Colour hex')
  })

  it('shows an error when the save fails', async () => {
    const page = await createSpoolsPage(createCalls(), {
      updateSpool: async () => {
        throw new Error('500')
      },
    })
    await click(page, '.save-button')
    expect(page.querySelector('.form-error')?.textContent).toContain('Could not save the spool')
  })

  it('creates a spool from an empty form after Add spool', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls)
    await click(page, '.add-spool-button')
    expect(findInput(page, 'brand').value).toBe('')
    await type(page, 'brand', 'Prusa')
    await type(page, 'material', 'PETG')
    await type(page, 'color', 'Orange')
    await type(page, 'costPerGram', '0.02')
    await click(page, '.save-button')
    expect(calls.updated).toEqual([])
    expect(calls.created).toHaveLength(1)
    expect(calls.created[0]).toMatchObject({ brand: 'Prusa', material: 'PETG', cost_per_gram: 0.02, color_hex: null })
  })

  it('has no delete button for a spool that is not saved yet', async () => {
    const page = await createSpoolsPage(createCalls())
    await click(page, '.add-spool-button')
    expect(page.querySelector('button[aria-label="Delete spool"]')).toBeNull()
  })

  it('loads the spools again after saving', async () => {
    let loadCount = 0
    const page = await createSpoolsPage(createCalls(), {
      loadSpools: async () => {
        loadCount += 1
        return fixtureSpools
      },
    })
    await click(page, '.save-button')
    expect(loadCount).toBe(2)
  })
})

describe('deleting', () => {
  it('asks for confirmation and then deletes the selected spool', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls)
    await click(page, 'button[aria-label="Delete spool"]')
    expect(calls.confirmations).toEqual(['Delete Sunlu PLA Plus?'])
    expect(calls.deleted).toEqual([1])
  })

  it('keeps the spool when the confirmation is declined', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls, { confirmAction: () => false })
    await click(page, 'button[aria-label="Delete spool"]')
    expect(calls.deleted).toEqual([])
  })

  it('says so when the spool still has linked prints', async () => {
    const page = await createSpoolsPage(createCalls(), { deleteSpool: async () => ({ ok: false, status: 409 }) })
    await click(page, 'button[aria-label="Delete spool"]')
    expect(page.querySelector('.form-error')?.textContent).toContain('linked prints')
  })
})

describe('setting the spool in use', () => {
  it('offers it for a spool that is not in use and marks that spool active', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls)
    findRows(page)[1].click()
    await page.updateComplete
    await click(page, '.set-in-use-button')
    expect(calls.updated).toEqual([{ id: 2, data: { active: 1 } }])
  })

  it('does not offer it for the spool that is in use', async () => {
    const page = await createSpoolsPage(createCalls())
    expect(page.querySelector('.set-in-use-button')).toBeNull()
  })
})

describe('spool NFC tags', () => {
  const readsTag =
    (tagId: string, records: TagRecord[] = []) =>
    async () => ({ tagId, records })

  it('offers no tag actions when the phone cannot read tags', async () => {
    const page = await createSpoolsPage(createCalls(), { readTag: null })
    expect(page.querySelector('.scan-tag-button')).toBeNull()
    expect(page.querySelector('.link-tag-button')).toBeNull()
  })

  it('selects the spool that a scanned tag belongs to', async () => {
    const page = await createSpoolsPage(createCalls(), {
      readTag: readsTag('04a1'),
      findSpoolByTag: async () => fixtureSpools[2],
    })
    await click(page, '.scan-tag-button')
    expect(page.querySelector('.spool-row.selected .spool-name')?.textContent?.trim()).toContain('Generic')
  })

  it('says so when a scanned tag is not linked to a spool', async () => {
    const page = await createSpoolsPage(createCalls(), {
      readTag: readsTag('04a1'),
      findSpoolByTag: async () => null,
    })
    await click(page, '.scan-tag-button')
    expect(page.querySelector('.scan-message')?.textContent).toContain('not linked')
  })

  it('links the scanned tag to the selected spool', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls, { readTag: readsTag('04a1') })
    await click(page, '.edit-spool-button')
    await click(page, '.link-tag-button')
    expect(calls.updated).toEqual([{ id: 1, data: { tag_id: '04a1' } }])
  })

  it('unlinks the tag of the selected spool with an empty tag', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls, { readTag: readsTag('04a1') }, [createSpool({ tag_id: '04a1' })])
    await click(page, '.edit-spool-button')
    await click(page, '.unlink-tag-button')
    expect(calls.updated).toEqual([{ id: 1, data: { tag_id: '' } }])
  })
})

describe('a scanned tag that carries a spool', () => {
  const encoder = new TextEncoder()
  const openSpoolRecord: TagRecord = {
    mediaType: 'application/json',
    data: encoder.encode('{"protocol":"openspool","type":"PETG","brand":"Polymaker","color_hex":"FFAABB"}'),
  }
  // an OpenPrintTag: PLA Galaxy Black of Prusament, 1012 g, color #3d3e3d
  const openPrintTagRecord: TagRecord = {
    mediaType: 'application/vnd.openprinttag',
    data: Uint8Array.from(
      'a0bf080009000a70504c412047616c61787920426c61636b0b6950727573616d656e74111903f413433d3e3dff'
        .match(/../g)!
        .map((pair) => parseInt(pair, 16)),
    ),
  }
  const readsUnlinkedTag = (records: TagRecord[]) => ({
    readTag: async () => ({ tagId: '04a1', records }),
    findSpoolByTag: async () => null,
  })

  it('fills in the form of a new spool with what the tag says', async () => {
    const page = await createSpoolsPage(createCalls(), readsUnlinkedTag([openSpoolRecord]))
    await click(page, '.scan-tag-button')
    expect(page.querySelector('.spools-details')?.textContent).toContain('Add spool')
    expect(findInput(page, 'brand').value).toBe('Polymaker')
    expect(findInput(page, 'material').value).toBe('PETG')
    expect(findInput(page, 'colorHex').value).toBe('#ffaabb')
  })

  it('says where the data came from and what is left to fill in', async () => {
    const page = await createSpoolsPage(createCalls(), readsUnlinkedTag([openSpoolRecord]))
    await click(page, '.scan-tag-button')
    expect(page.querySelector('.spool-tag-notice')?.textContent).toContain('OpenSpool')
    expect(page.querySelector('.spool-tag-notice')?.textContent).toContain('price per gram')
  })

  it('fills in the name of the color and the weights from an OpenPrintTag', async () => {
    const page = await createSpoolsPage(createCalls(), readsUnlinkedTag([openPrintTagRecord]))
    await click(page, '.scan-tag-button')
    expect(findInput(page, 'brand').value).toBe('Prusament')
    expect(findInput(page, 'color').value).toBe('Galaxy Black')
    expect(findInput(page, 'initialWeight').value).toBe('1012')
    expect(findInput(page, 'currentWeight').value).toBe('1012')
    expect(findInput(page, 'colorHex').value).toBe('#3d3e3d')
  })

  it('saves the spool with the id of the tag', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls, readsUnlinkedTag([openPrintTagRecord]))
    await click(page, '.scan-tag-button')
    await type(page, 'costPerGram', '0.025')
    await click(page, '.save-button')
    expect(calls.created).toHaveLength(1)
    expect(calls.created[0]).toMatchObject({ brand: 'Prusament', material: 'PLA', tag_id: '04a1' })
  })

  it('does not link the tag when the form is closed and another spool is started', async () => {
    const calls = createCalls()
    const page = await createSpoolsPage(calls, readsUnlinkedTag([openSpoolRecord]))
    await click(page, '.scan-tag-button')
    await click(page, '.close-details-button')
    await click(page, '.add-spool-button')
    await type(page, 'brand', 'Other')
    await type(page, 'material', 'PLA')
    await type(page, 'color', 'Red')
    await type(page, 'initialWeight', '1000')
    await type(page, 'currentWeight', '1000')
    await type(page, 'costPerGram', '0.02')
    await click(page, '.save-button')
    expect(calls.created[0]).not.toHaveProperty('tag_id')
  })

  it('still selects the spool of the tag when the tag is linked, whatever is on it', async () => {
    const page = await createSpoolsPage(createCalls(), {
      readTag: async () => ({ tagId: '04a1', records: [openSpoolRecord] }),
      findSpoolByTag: async () => fixtureSpools[2],
    })
    await click(page, '.scan-tag-button')
    expect(page.querySelector('.spool-row.selected .spool-name')?.textContent?.trim()).toContain('Generic')
    expect(page.querySelector('.spools-details')?.textContent).not.toContain('Add spool')
  })

  it('says the tag is not linked when nothing on it is a known format', async () => {
    const unknown: TagRecord = { mediaType: 'text/plain', data: encoder.encode('hello') }
    const page = await createSpoolsPage(createCalls(), readsUnlinkedTag([unknown]))
    await click(page, '.scan-tag-button')
    expect(page.querySelector('.scan-message')?.textContent).toContain('not linked')
  })
})
