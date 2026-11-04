import type { SystemSection } from '../types'

/** One page of the system list: a few related sections of the report under a heading. */
export interface SystemPageEntry {
  key: string
  title: string
  heading: string
  sections: SystemSection[]
}

interface PageDefinition {
  key: string
  title: string
  heading: string
  sectionKeys: string[]
  sectionKeyPrefix?: string
}

const COMPUTER = 'Computer'
const PRINTER = 'Printer'

const PAGE_DEFINITIONS: PageDefinition[] = [
  { key: 'host', title: 'Host', heading: COMPUTER, sectionKeys: ['host', 'storage', 'network'] },
  { key: 'software', title: 'Software', heading: COMPUTER, sectionKeys: ['software', 'services'] },
  { key: 'control-boards', title: 'Control boards', heading: PRINTER, sectionKeys: [], sectionKeyPrefix: 'board.' },
  { key: 'motion', title: 'Motion', heading: PRINTER, sectionKeys: ['motion', 'drivers', 'filament'] },
  { key: 'temperatures', title: 'Temperatures', heading: PRINTER, sectionKeys: ['temperatures', 'fans'] },
]

const OTHER_PAGE: PageDefinition = { key: 'other', title: 'Other', heading: 'Other', sectionKeys: [] }

function belongsTo(definition: PageDefinition, section: SystemSection): boolean {
  if (definition.sectionKeys.includes(section.key)) return true
  return definition.sectionKeyPrefix !== undefined && section.key.startsWith(definition.sectionKeyPrefix)
}

function findDefinition(section: SystemSection): PageDefinition {
  return PAGE_DEFINITIONS.find((definition) => belongsTo(definition, section)) ?? OTHER_PAGE
}

function createPage(definition: PageDefinition, sections: SystemSection[]): SystemPageEntry {
  const { key, title, heading } = definition
  return { key, title, heading, sections: sections.filter((section) => findDefinition(section) === definition) }
}

/** The sections of the report, put on the pages they belong to. A section nobody knows goes on Other. */
export function groupSections(sections: SystemSection[]): SystemPageEntry[] {
  const pages = [...PAGE_DEFINITIONS, OTHER_PAGE].map((definition) => createPage(definition, sections))
  return pages.filter((page) => page.sections.length > 0)
}
