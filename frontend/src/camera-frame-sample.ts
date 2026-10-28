import type { FrameSample } from './camera-stream-watchdog'

const PROBE_COLUMNS = 64
const PROBE_ROWS = 36
const CHANNELS_PER_PIXEL = 4
const BLANK_BRIGHTNESS = 3
const HASH_OFFSET = 2166136261
const HASH_PRIME = 16777619

let probeContext: CanvasRenderingContext2D | null = null

function findProbeContext(): CanvasRenderingContext2D | null {
  if (probeContext) return probeContext
  const probe = document.createElement('canvas')
  probe.width = PROBE_COLUMNS
  probe.height = PROBE_ROWS
  probeContext = probe.getContext('2d', { willReadFrequently: true })
  return probeContext
}

function findBrightness(pixels: Uint8ClampedArray, offset: number): number {
  return Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2])
}

function describePixels(pixels: Uint8ClampedArray): FrameSample {
  let hash = HASH_OFFSET
  let brightest = 0
  for (let offset = 0; offset < pixels.length; offset += CHANNELS_PER_PIXEL) {
    brightest = Math.max(brightest, findBrightness(pixels, offset))
    hash = Math.imul(hash ^ pixels[offset] ^ (pixels[offset + 1] << 8) ^ (pixels[offset + 2] << 16), HASH_PRIME)
  }
  return { signature: String(hash >>> 0), isBlank: brightest <= BLANK_BRIGHTNESS }
}

function sampleFrame(image: HTMLImageElement): FrameSample | null {
  const context = findProbeContext()
  if (!context) return null
  try {
    context.drawImage(image, 0, 0, PROBE_COLUMNS, PROBE_ROWS)
    return describePixels(context.getImageData(0, 0, PROBE_COLUMNS, PROBE_ROWS).data)
  } catch {
    return null
  }
}

function drawFrame(image: HTMLImageElement, canvas: HTMLCanvasElement): void {
  if (canvas.width !== image.naturalWidth) canvas.width = image.naturalWidth
  if (canvas.height !== image.naturalHeight) canvas.height = image.naturalHeight
  canvas.getContext('2d')?.drawImage(image, 0, 0)
}

/** Looks at the picture the stream shows now, and keeps it in the canvas as the last frame unless it is black. */
export function captureFrame(image: HTMLImageElement, canvas: HTMLCanvasElement): FrameSample | null {
  if (image.naturalWidth === 0) return null
  const sample = sampleFrame(image)
  if (sample && !sample.isBlank) drawFrame(image, canvas)
  return sample
}
