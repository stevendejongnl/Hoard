import { afterEach, describe, expect, it } from 'vitest'
import type { GcodeFile } from '../types'
import './file-browser-modal'
import type { FileBrowserModal } from './file-browser-modal'

const files = [
  { filename: 'helicopter-blade.gcode', size: 4_200_000, modified: 1, estimated_time: 660, filament_weight_total: 3.8 },
  { filename: 'plate.gcode', size: 2048, modified: 2 },
] as GcodeFile[]

interface Calls {
  selected: string[]
  closed: number
  uploads: string[]
}

async function createBrowser(
  properties: Partial<FileBrowserModal> = {},
): Promise<{ browser: FileBrowserModal; calls: Calls }> {
  const calls: Calls = { selected: [], closed: 0, uploads: [] }
  const browser = document.createElement('file-browser-modal') as FileBrowserModal
  browser.loadFiles = async () => files
  browser.uploadFile = async (file) => void calls.uploads.push(file.name)
  browser.addEventListener('file-selected', (event) => calls.selected.push((event as CustomEvent).detail.filename))
  browser.addEventListener('close', () => (calls.closed += 1))
  browser.open = true
  Object.assign(browser, properties)
  document.body.appendChild(browser)
  await settle(browser)
  return { browser, calls }
}

async function settle(browser: FileBrowserModal): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await browser.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await browser.updateComplete
}

async function click(browser: FileBrowserModal, selector: string): Promise<void> {
  browser.querySelector<HTMLElement>(selector)?.click()
  await settle(browser)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('file browser', () => {
  it('shows nothing while closed', async () => {
    const { browser } = await createBrowser({ open: false })
    expect(browser.querySelector('.files-dialog')).toBeNull()
  })

  it('lists the files with size, time and filament', async () => {
    const { browser } = await createBrowser()
    const rows = browser.querySelectorAll('.table-row.browser-file-row')
    expect(rows.length).toBe(2)
    expect(rows[0].textContent).toContain('helicopter-blade.gcode')
    expect(rows[0].textContent).toContain('4.0 MB')
    expect(rows[0].textContent).toContain('0h 11m')
    expect(rows[0].textContent).toContain('3.8 g')
    expect(rows[1].textContent).toContain('2 KB')
  })

  it('narrows the list by name', async () => {
    const { browser } = await createBrowser()
    const search = browser.querySelector<HTMLInputElement>('input.files-search')!
    search.value = 'plate'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await browser.updateComplete
    expect(browser.querySelectorAll('.browser-file-row').length).toBe(1)
  })

  it('cannot select before a file is chosen', async () => {
    const { browser } = await createBrowser()
    expect(browser.querySelector<HTMLButtonElement>('button.select-file-button')?.disabled).toBe(true)
  })

  it('selects the chosen file and closes', async () => {
    const { browser, calls } = await createBrowser()
    await click(browser, '.browser-file-row:nth-of-type(2)')
    expect(browser.querySelectorAll('.browser-file-row.selected').length).toBe(1)
    await click(browser, 'button.select-file-button')
    expect(calls.selected).toEqual(['plate.gcode'])
    expect(calls.closed).toBe(1)
  })

  it('starts with the file it was told about selected', async () => {
    const { browser } = await createBrowser({ initialSelection: 'plate.gcode' })
    expect(browser.querySelector('.browser-file-row.selected')?.textContent).toContain('plate.gcode')
    expect(browser.querySelector<HTMLButtonElement>('button.select-file-button')?.disabled).toBe(false)
  })

  it('closes with Cancel', async () => {
    const { browser, calls } = await createBrowser()
    await click(browser, 'button.cancel-button')
    expect(calls.closed).toBe(1)
    expect(calls.selected).toEqual([])
  })

  it('uploads a file and lists the files again', async () => {
    let loads = 0
    const { browser, calls } = await createBrowser({
      loadFiles: async () => {
        loads += 1
        return files
      },
    })
    const input = browser.querySelector<HTMLInputElement>('input[type="file"]')!
    const upload = new File(['x'], 'new.gcode')
    Object.defineProperty(input, 'files', { value: [upload] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await settle(browser)
    expect(calls.uploads).toEqual(['new.gcode'])
    expect(loads).toBe(2)
  })

  it('says so when there are no files or loading fails', async () => {
    const { browser } = await createBrowser({ loadFiles: async () => [] })
    expect(browser.querySelector('.state-message')?.textContent).toBe('No files on the printer')
    const { browser: failing } = await createBrowser({
      loadFiles: async () => {
        throw new Error('offline')
      },
    })
    expect(failing.querySelector('.state-message')?.textContent).toBe('Could not load the files')
  })
})
