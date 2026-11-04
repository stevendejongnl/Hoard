import { afterEach, describe, expect, it } from 'vitest'
import './control-bed-mesh-card'
import type { ControlBedMeshCard } from './control-bed-mesh-card'
import { findButton, mountCard } from './control-card-testing'
import type { BedMesh } from '../types'

const MESH: BedMesh = {
  profile_name: 'default',
  mesh_min: [10, 10],
  mesh_max: [200, 200],
  probed_matrix: [
    [-0.08, 0.0, 0.03],
    [-0.02, 0.05, 0.1],
  ],
}

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(loadMesh: () => Promise<BedMesh>, locked = false) {
  const { card } = await mountCard<ControlBedMeshCard>('control-bed-mesh-card', { locked })
  card.loadMesh = loadMesh
  card.connectedCallback()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await card.updateComplete
  return card
}

describe('the bed mesh card', () => {
  it('shows a cell for every probed point, with its height written plainly', async () => {
    const card = await mount(async () => MESH)
    const cells = [...card.querySelectorAll('.control-mesh-cell')]
    expect(cells.map((cell) => cell.textContent?.trim())).toEqual([
      '-0.08',
      '+0.00',
      '+0.03',
      '-0.02',
      '+0.05',
      '+0.10',
    ])
    expect((card.querySelector('.control-mesh-grid') as HTMLElement).style.gridTemplateColumns).toBe('repeat(3, 1fr)')
  })

  it('tells a low point from a high one by colour as well as by sign', async () => {
    const card = await mount(async () => MESH)
    const cells = [...card.querySelectorAll('.control-mesh-cell')] as HTMLElement[]
    expect(cells[0].classList.contains('low')).toBe(true)
    expect(cells[5].classList.contains('high')).toBe(true)
    expect(cells[0].style.background).not.toBe(cells[5].style.background)
  })

  it('names the profile in the header and gives the range', async () => {
    const card = await mount(async () => MESH)
    expect(card.querySelector('.control-card-header')?.textContent).toContain('default')
    expect(card.textContent).toContain('Range 0.18 mm')
  })

  it('says so when there is no mesh', async () => {
    const card = await mount(async () => ({ ...MESH, probed_matrix: [] }))
    expect(card.textContent).toContain('No bed mesh loaded')
  })

  it('says so when the mesh cannot be read', async () => {
    const card = await mount(async () => {
      throw new Error('offline')
    })
    expect(card.textContent).toContain('Could not read the bed mesh')
  })

  it('reads the mesh again on request, also while printing', async () => {
    let reads = 0
    const card = await mount(async () => {
      reads += 1
      return MESH
    }, true)
    findButton(card, 'Reload the bed mesh').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(2)
  })
})
