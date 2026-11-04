import { describe, expect, it } from 'vitest'
import { groupSections } from './system-pages'
import type { SystemSection } from '../types'

function section(key: string, title = key): SystemSection {
  return { key, title, rows: [{ key: `${key}.row`, label: 'Row', value: '1' }] }
}

function describePages(sections: SystemSection[]): string[] {
  return groupSections(sections).map(
    (page) => `${page.heading}/${page.title}: ${page.sections.map((entry) => entry.key)}`,
  )
}

describe('groupSections', () => {
  it('puts the host, its storage and its network on one page', () => {
    expect(describePages([section('host'), section('storage'), section('network')])).toEqual([
      'Computer/Host: host,storage,network',
    ])
  })

  it('puts the software and its services on one page', () => {
    expect(describePages([section('software'), section('services')])).toEqual(['Computer/Software: software,services'])
  })

  it('puts every control board on one page, whatever it is called', () => {
    expect(describePages([section('board.mcu'), section('board.mcu toolboard')])).toEqual([
      'Printer/Control boards: board.mcu,board.mcu toolboard',
    ])
  })

  it('puts motion, stepper drivers and filament sensors on one page', () => {
    expect(describePages([section('motion'), section('drivers'), section('filament')])).toEqual([
      'Printer/Motion: motion,drivers,filament',
    ])
  })

  it('puts temperatures and fans on one page', () => {
    expect(describePages([section('temperatures'), section('fans')])).toEqual([
      'Printer/Temperatures: temperatures,fans',
    ])
  })

  it('keeps what it does not know on a page called Other, so nothing the printer reports is lost', () => {
    expect(describePages([section('host'), section('chamber_lights')])).toEqual([
      'Computer/Host: host',
      'Other/Other: chamber_lights',
    ])
  })

  it('leaves out a page with no sections', () => {
    expect(describePages([section('fans')])).toEqual(['Printer/Temperatures: fans'])
  })

  it('lists the pages in a fixed order, not in the order the printer reports them', () => {
    const pages = groupSections([section('fans'), section('host'), section('board.mcu'), section('services')])
    expect(pages.map((page) => page.title)).toEqual(['Host', 'Software', 'Control boards', 'Temperatures'])
  })

  it('gives every page a key that names it', () => {
    expect(groupSections([section('host'), section('board.mcu')]).map((page) => page.key)).toEqual([
      'host',
      'control-boards',
    ])
  })
})
