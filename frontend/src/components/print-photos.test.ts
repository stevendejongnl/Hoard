import { afterEach, describe, expect, it } from 'vitest'
import type { PrintPhoto } from '../types'
import './print-photos'
import type { PrintPhotos } from './print-photos'

const photos = [
  { id: 1, filename: 'one.jpg', source: 'upload' },
  { id: 2, filename: 'two.jpg', source: 'webcam' },
] as PrintPhoto[]

interface Calls {
  uploaded: string[]
  deleted: number[]
  changes: PrintPhoto[][]
}

async function createPhotos(properties: Partial<PrintPhotos> = {}): Promise<{ element: PrintPhotos; calls: Calls }> {
  const calls: Calls = { uploaded: [], deleted: [], changes: [] }
  const element = document.createElement('print-photos') as PrintPhotos
  element.jobId = 'job-1'
  element.photos = photos
  element.uploadPhoto = async (_jobId, file) => {
    calls.uploaded.push(file.name)
    return { id: 3, filename: file.name, source: 'upload' } as PrintPhoto
  }
  element.deletePhoto = async (_jobId, photoId) => void calls.deleted.push(photoId)
  element.addEventListener('photos-changed', (event) => calls.changes.push((event as CustomEvent).detail.photos))
  Object.assign(element, properties)
  document.body.appendChild(element)
  await element.updateComplete
  return { element, calls }
}

async function settle(element: PrintPhotos): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await element.updateComplete
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('print photos', () => {
  it('shows a tile for each photo, loaded from the print', async () => {
    const { element } = await createPhotos()
    const sources = [...element.querySelectorAll('.photo-tile img')].map((image) => image.getAttribute('src'))
    expect(sources).toEqual(['/api/photos/job-1/one.jpg', '/api/photos/job-1/two.jpg'])
  })

  it('marks a photo taken by the webcam', async () => {
    const { element } = await createPhotos()
    expect(element.querySelectorAll('.photo-source')[0].textContent).toBe('webcam')
  })

  it('always has a tile to add a photo, also without photos', async () => {
    const { element } = await createPhotos({ photos: [] })
    expect(element.querySelectorAll('.photo-tile').length).toBe(0)
    expect(element.querySelector('button.add-photo-tile')?.getAttribute('aria-label')).toBe('Add photo')
  })

  it('uploads the chosen file and adds it to the photos', async () => {
    const { element, calls } = await createPhotos()
    const input = element.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'new.jpg')] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await settle(element)
    expect(calls.uploaded).toEqual(['new.jpg'])
    expect(element.querySelectorAll('.photo-tile').length).toBe(3)
    expect(calls.changes.at(-1)?.length).toBe(3)
  })

  it('deletes a photo', async () => {
    const { element, calls } = await createPhotos()
    element.querySelectorAll<HTMLElement>('button.delete-photo-button')[0].click()
    await settle(element)
    expect(calls.deleted).toEqual([1])
    expect(element.querySelectorAll('.photo-tile').length).toBe(1)
  })

  it('shows a photo larger and closes it again', async () => {
    const { element } = await createPhotos()
    element.querySelector<HTMLElement>('.photo-tile')?.click()
    await element.updateComplete
    expect(element.querySelector('.photo-lightbox img')?.getAttribute('src')).toBe('/api/photos/job-1/one.jpg')
    element.querySelector<HTMLElement>('.photo-lightbox')?.click()
    await element.updateComplete
    expect(element.querySelector('.photo-lightbox')).toBeNull()
  })
})
