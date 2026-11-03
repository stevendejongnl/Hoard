import { afterEach, describe, expect, it } from 'vitest'
import './detection-frame'
import type { DetectionFrame } from './detection-frame'
import type { DetectionBox } from '../types'

const BOXES: DetectionBox[] = [
  { label: 'failure', score: 0.82, box: [100, 200, 40, 60] },
  { label: 'failure', score: 0.2, box: null },
]

async function createFrame(properties: Partial<DetectionFrame> = {}): Promise<DetectionFrame> {
  const frame = document.createElement('detection-frame') as DetectionFrame
  Object.assign(frame, { frameUrl: '/api/detection/alerts/7/frame', boxes: BOXES, ...properties })
  document.body.appendChild(frame)
  await frame.updateComplete
  return frame
}

async function loadImage(frame: DetectionFrame, width: number, height: number): Promise<void> {
  const image = frame.querySelector('img') as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { value: width })
  Object.defineProperty(image, 'naturalHeight', { value: height })
  image.dispatchEvent(new Event('load'))
  await frame.updateComplete
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('detection frame', () => {
  it('shows the kept camera frame', async () => {
    const frame = await createFrame()
    expect(frame.querySelector('img')?.getAttribute('src')).toBe('/api/detection/alerts/7/frame')
  })

  it('says so when no frame was kept', async () => {
    const frame = await createFrame({ frameUrl: null })
    expect(frame.querySelector('img')).toBeNull()
    expect(frame.textContent).toContain('No frame kept')
  })

  it('draws no boxes before the frame has loaded, because their size depends on it', async () => {
    const frame = await createFrame()
    expect(frame.querySelector('svg')).toBeNull()
  })

  it('draws a box for each detection that has one, over the frame at its own size', async () => {
    const frame = await createFrame()
    await loadImage(frame, 640, 480)
    expect(frame.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 640 480')
    const rectangles = frame.querySelectorAll('rect')
    expect(rectangles).toHaveLength(1)
    expect(['x', 'y', 'width', 'height'].map((name) => rectangles[0].getAttribute(name))).toEqual([
      '80',
      '170',
      '40',
      '60',
    ])
  })
})
