import type { SpoolTagDraft } from './spool-tag-formats'
import type { Spool } from './types'
import { normalizeHexadecimalColor } from './theme'

export type ShowFilter = 'all' | 'in-use'

export interface SpoolSummary {
  spoolCount: number
  inUseCount: number
  filamentLeftGrams: number
}

export interface SpoolForm {
  brand: string
  material: string
  color: string
  colorHex: string
  initialWeight: string
  currentWeight: string
  totalPrice: string
  notes: string
}

export type SpoolFormResult = { isValid: true; payload: Partial<Spool> } | { isValid: false; message: string }

const COST_DECIMALS = 3
const TOTAL_PRICE_DECIMALS = 4
const COST_PER_GRAM_SIGNIFICANT_DIGITS = 12
const DEFAULT_INITIAL_WEIGHT = '1000'

export function buildSpoolName(spool: Spool): string {
  return `${spool.brand} ${spool.material}`.trim()
}

export function formatMaterialLabel(material: string): string {
  return material.replace(/ Plus$/, '+')
}

export function formatCostPerGram(costPerGram: number): string {
  const fixed = costPerGram.toFixed(COST_DECIMALS)
  return Number(fixed) === costPerGram ? fixed : String(costPerGram)
}

function formatTotalPrice(totalPrice: number): string {
  return String(Number(totalPrice.toFixed(TOTAL_PRICE_DECIMALS)))
}

function calculateCostPerGram(totalPrice: number, initialWeight: number): number {
  return Number((totalPrice / initialWeight).toPrecision(COST_PER_GRAM_SIGNIFICANT_DIGITS))
}

export function describeCostPerGram(form: SpoolForm): string {
  const totalPrice = parseNumber(form.totalPrice)
  const initialWeight = parseNumber(form.initialWeight)
  if (!(totalPrice >= 0) || !(initialWeight > 0)) return ''
  return `= ${formatCostPerGram(calculateCostPerGram(totalPrice, initialWeight))} € per gram`
}

export function calculateRemainingPercent(spool: Spool): number {
  if (spool.initial_weight_g <= 0) return 0
  const percent = Math.round((spool.current_weight_g / spool.initial_weight_g) * 100)
  return Math.min(100, Math.max(0, percent))
}

export function filterSpools(spools: Spool[], material: string, show: ShowFilter): Spool[] {
  const matchesMaterial = (spool: Spool) => material === '' || spool.material === material
  const matchesShow = (spool: Spool) => show === 'all' || Boolean(spool.active)
  return spools.filter((spool) => matchesMaterial(spool) && matchesShow(spool))
}

export function listMaterials(spools: Spool[]): string[] {
  return [...new Set(spools.map((spool) => spool.material))].sort()
}

export function summarizeSpools(spools: Spool[]): SpoolSummary {
  return {
    spoolCount: spools.length,
    inUseCount: spools.filter((spool) => Boolean(spool.active)).length,
    filamentLeftGrams: spools.reduce((total, spool) => total + spool.current_weight_g, 0),
  }
}

function describeWeight(grams: number | null, fallback: string): string {
  return grams === null ? fallback : String(Math.round(grams))
}

/** The form of a new spool, filled in with what a tag says about it; the price per gram is left to the person. */
export function createFormFromTagDraft(draft: SpoolTagDraft): SpoolForm {
  const blank = createFormFromSpool(null)
  return {
    ...blank,
    brand: draft.brand,
    material: draft.material,
    color: draft.color,
    colorHex: draft.colorHexadecimal ?? '',
    initialWeight: describeWeight(draft.initialWeightGrams, blank.initialWeight),
    currentWeight: describeWeight(draft.currentWeightGrams, blank.currentWeight),
  }
}

export function createFormFromSpool(spool: Spool | null): SpoolForm {
  if (!spool) {
    return {
      brand: '',
      material: '',
      color: '',
      colorHex: '',
      initialWeight: DEFAULT_INITIAL_WEIGHT,
      currentWeight: DEFAULT_INITIAL_WEIGHT,
      totalPrice: '',
      notes: '',
    }
  }
  return {
    brand: spool.brand,
    material: formatMaterialLabel(spool.material),
    color: spool.color,
    colorHex: spool.color_hex ?? '',
    initialWeight: String(spool.initial_weight_g),
    currentWeight: String(spool.current_weight_g),
    totalPrice: formatTotalPrice(spool.cost_per_gram * spool.initial_weight_g),
    notes: spool.notes ?? '',
  }
}

function parseNumber(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}

function findFormProblem(form: SpoolForm): string | null {
  const initialWeight = parseNumber(form.initialWeight)
  const currentWeight = parseNumber(form.currentWeight)
  const totalPrice = parseNumber(form.totalPrice)
  if (form.brand.trim() === '') return 'Brand is required'
  if (form.colorHex.trim() !== '' && normalizeHexadecimalColor(form.colorHex) === null) {
    return 'Colour hex must look like #RRGGBB'
  }
  if (!(initialWeight > 0)) return 'Initial weight must be a number above zero'
  if (!(currentWeight >= 0)) return 'Current weight must be a number of zero or more'
  if (!(totalPrice >= 0)) return 'Total price must be a number of zero or more'
  return null
}

export function parseSpoolForm(form: SpoolForm): SpoolFormResult {
  const message = findFormProblem(form)
  if (message) return { isValid: false, message }
  return {
    isValid: true,
    payload: {
      brand: form.brand.trim(),
      material: form.material.trim().replace(/\+$/, ' Plus'),
      color: form.color.trim(),
      color_hex: normalizeHexadecimalColor(form.colorHex),
      initial_weight_g: Number(form.initialWeight),
      current_weight_g: Number(form.currentWeight),
      cost_per_gram: calculateCostPerGram(parseNumber(form.totalPrice), parseNumber(form.initialWeight)),
      notes: form.notes.trim() === '' ? null : form.notes,
    },
  }
}
