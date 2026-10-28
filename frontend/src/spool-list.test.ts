import { describe, expect, it } from 'vitest'
import type { Spool } from './types'
import {
  buildSpoolName,
  calculateRemainingPercent,
  createFormFromSpool,
  describeCostPerGram,
  filterSpools,
  formatCostPerGram,
  formatMaterialLabel,
  listMaterials,
  parseSpoolForm,
  summarizeSpools,
} from './spool-list'

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

const sunlu = createSpool()
const esun = createSpool({ id: 2, brand: 'eSUN', material: 'PLA', color: 'Black', current_weight_g: 612, active: 0 })
const petg = createSpool({ id: 3, brand: 'Prusa', material: 'PETG', color: 'Grey', current_weight_g: 310, active: 0 })

describe('spool names and labels', () => {
  it('builds the name from brand and material', () => {
    expect(buildSpoolName(sunlu)).toBe('Sunlu PLA Plus')
    expect(buildSpoolName(esun)).toBe('eSUN PLA')
  })

  it('shortens "Plus" at the end of a material to a plus sign', () => {
    expect(formatMaterialLabel('PLA Plus')).toBe('PLA+')
    expect(formatMaterialLabel('PETG')).toBe('PETG')
  })

  it('shows the cost per gram with three decimals when that loses nothing', () => {
    expect(formatCostPerGram(0.01)).toBe('0.010')
    expect(formatCostPerGram(0.00123)).toBe('0.00123')
  })

  it('calculates the remaining share, limited between zero and one hundred', () => {
    expect(calculateRemainingPercent(sunlu)).toBe(84)
    expect(calculateRemainingPercent(createSpool({ initial_weight_g: 0 }))).toBe(0)
    expect(calculateRemainingPercent(createSpool({ current_weight_g: 1500 }))).toBe(100)
  })
})

describe('filtering', () => {
  const spools = [sunlu, esun, petg]

  it('keeps everything without filters', () => {
    expect(filterSpools(spools, '', 'all')).toEqual(spools)
  })

  it('filters by material', () => {
    expect(filterSpools(spools, 'PLA', 'all')).toEqual([esun])
  })

  it('filters on spools in use', () => {
    expect(filterSpools(spools, '', 'in-use')).toEqual([sunlu])
  })

  it('combines both filters', () => {
    expect(filterSpools(spools, 'PLA', 'in-use')).toEqual([])
  })

  it('lists each material once, sorted', () => {
    expect(listMaterials([sunlu, esun, petg, esun])).toEqual(['PETG', 'PLA', 'PLA Plus'])
  })
})

describe('summary', () => {
  it('counts spools, spools in use and the filament left', () => {
    expect(summarizeSpools([sunlu, esun, petg])).toEqual({ spoolCount: 3, inUseCount: 1, filamentLeftGrams: 1762 })
  })

  it('is all zero without spools', () => {
    expect(summarizeSpools([])).toEqual({ spoolCount: 0, inUseCount: 0, filamentLeftGrams: 0 })
  })
})

describe('the form', () => {
  it('fills from a spool', () => {
    expect(createFormFromSpool(createSpool({ notes: 'dry' }))).toEqual({
      brand: 'Sunlu',
      material: 'PLA+',
      color: 'White',
      colorHex: '#F8FAFC',
      initialWeight: '1000',
      currentWeight: '840',
      totalPrice: '10',
      notes: 'dry',
    })
  })

  it('shows the total price as the cost per gram times the initial weight, without float noise', () => {
    const form = createFormFromSpool(createSpool({ cost_per_gram: 0.01507, initial_weight_g: 1000 }))
    expect(form.totalPrice).toBe('15.07')
  })

  it('is empty without a spool', () => {
    expect(createFormFromSpool(null)).toEqual({
      brand: '',
      material: '',
      color: '',
      colorHex: '',
      initialWeight: '1000',
      currentWeight: '1000',
      totalPrice: '',
      notes: '',
    })
  })

  const validForm = {
    brand: ' Sunlu ',
    material: 'PLA+',
    color: 'White',
    colorHex: 'f8fafc',
    initialWeight: '1000',
    currentWeight: '840',
    totalPrice: '10',
    notes: '',
  }

  it('turns a valid form into a payload', () => {
    expect(parseSpoolForm(validForm)).toEqual({
      isValid: true,
      payload: {
        brand: 'Sunlu',
        material: 'PLA Plus',
        color: 'White',
        color_hex: '#f8fafc',
        initial_weight_g: 1000,
        current_weight_g: 840,
        cost_per_gram: 0.01,
        notes: null,
      },
    })
  })

  it('calculates the cost per gram from the total price and the initial weight', () => {
    const result = parseSpoolForm({ ...validForm, totalPrice: '15.07', initialWeight: '1000' })
    expect(result).toMatchObject({ isValid: true, payload: { cost_per_gram: 0.01507 } })
  })

  it('keeps the total price and recalculates the cost per gram when the weight changes', () => {
    const result = parseSpoolForm({ ...validForm, totalPrice: '15.07', initialWeight: '500' })
    expect(result).toMatchObject({ isValid: true, payload: { cost_per_gram: 0.03014 } })
  })

  it('describes the calculated cost per gram for the form', () => {
    expect(describeCostPerGram({ ...validForm, totalPrice: '15.07', initialWeight: '1000' })).toBe(
      '= 0.01507 € per gram',
    )
  })

  it('describes nothing while the price or the weight is not a usable number', () => {
    expect(describeCostPerGram({ ...validForm, totalPrice: '' })).toBe('')
    expect(describeCostPerGram({ ...validForm, totalPrice: '15.07', initialWeight: '0' })).toBe('')
    expect(describeCostPerGram({ ...validForm, totalPrice: 'x' })).toBe('')
  })

  it('turns the plus sign back into "Plus" so a shown label saves as stored', () => {
    expect(parseSpoolForm(validForm)).toMatchObject({ payload: { material: 'PLA Plus' } })
  })

  it('accepts an empty colour hex as no colour', () => {
    const result = parseSpoolForm({ ...validForm, colorHex: '' })
    expect(result).toMatchObject({ isValid: true, payload: { color_hex: null } })
  })

  it.each([
    ['brand', { brand: ' ' }, 'Brand is required'],
    ['colour hex', { colorHex: 'blue' }, 'Colour hex must look like #RRGGBB'],
    ['initial weight', { initialWeight: 'abc' }, 'Initial weight must be a number above zero'],
    ['initial weight zero', { initialWeight: '0' }, 'Initial weight must be a number above zero'],
    ['current weight', { currentWeight: '-1' }, 'Current weight must be a number of zero or more'],
    ['total price', { totalPrice: 'x' }, 'Total price must be a number of zero or more'],
    ['negative total price', { totalPrice: '-1' }, 'Total price must be a number of zero or more'],
  ])('rejects a wrong %s', (_name, change, message) => {
    expect(parseSpoolForm({ ...validForm, ...change })).toEqual({ isValid: false, message })
  })
})
