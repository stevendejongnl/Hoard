import { afterEach, describe, expect, it, vi } from 'vitest'
import './projects-page'
import type { ProjectsPage } from './projects-page'
import type { Project } from '../types'

function createProject(overrides: Partial<Project>): Project {
  return {
    id: 1,
    name: 'Project',
    notes: null,
    created_at: 0,
    print_count: 0,
    total_duration_s: null,
    avg_duration_s: null,
    max_duration_s: null,
    total_cost: null,
    avg_cost: null,
    total_filament_g: null,
    ...overrides,
  }
}

const PROJECTS: Project[] = [
  createProject({
    id: 1,
    name: 'Dactyl Manuform',
    print_count: 2,
    total_duration_s: 21480,
    total_cost: 0.86,
    total_filament_g: 86.6,
  }),
  createProject({
    id: 2,
    name: 'Doorhandle',
    print_count: 5,
    total_duration_s: 24240,
    total_cost: 1.9,
    total_filament_g: 126.5,
  }),
  createProject({ id: 3, name: 'Voron 2.4' }),
]

class FakeEnvironment {
  projects = PROJECTS
  nameToGive: string | null = 'Benchy'
  createdNames: string[] = []
  visitedPaths: string[] = []

  loadProjects = async () => this.projects

  createProject = async (name: string) => {
    this.createdNames.push(name)
    return createProject({ id: 42, name })
  }

  askForProjectName = () => this.nameToGive

  navigate = (path: string) => {
    this.visitedPaths.push(path)
  }
}

const mountedPages: ProjectsPage[] = []

async function mountPage(environment: FakeEnvironment): Promise<ProjectsPage> {
  const page = document.createElement('projects-page') as ProjectsPage
  page.loadProjects = environment.loadProjects
  page.createProject = environment.createProject
  page.askForProjectName = environment.askForProjectName
  page.navigate = environment.navigate
  document.body.appendChild(page)
  mountedPages.push(page)
  await vi.waitFor(() => expect(page.querySelector('.project-card')).not.toBeNull())
  return page
}

function readCardNames(page: ProjectsPage): string[] {
  return [...page.querySelectorAll('.project-card .project-name')].map((name) => name.textContent?.trim() ?? '')
}

function readTotal(page: ProjectsPage, total: string): string {
  return page.querySelector(`[data-total="${total}"]`)?.textContent?.replace(/\s+/g, '') ?? ''
}

async function typeQuery(page: ProjectsPage, query: string): Promise<void> {
  const input = page.querySelector('input[type="search"]') as HTMLInputElement
  input.value = query
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await page.updateComplete
}

async function chooseOrder(page: ProjectsPage, order: string): Promise<void> {
  const select = page.querySelector('select.sort-select') as HTMLSelectElement
  select.value = order
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await page.updateComplete
}

afterEach(() => {
  mountedPages.splice(0).forEach((page) => page.remove())
})

describe('projects-page', () => {
  it('names the filament in the short summary of a card, as the phone shows no statistics', async () => {
    const page = await mountPage(new FakeEnvironment())
    const summary = page.querySelector('.card-summary')?.textContent ?? ''
    expect(summary).toContain('86.6 g')
  })

  it('shows a card for every project with its statistics', async () => {
    const page = await mountPage(new FakeEnvironment())
    expect(readCardNames(page)).toEqual(['Dactyl Manuform', 'Doorhandle', 'Voron 2.4'])
    const firstCard = page.querySelector('.project-card')?.textContent?.replace(/\s+/g, ' ')
    expect(firstCard).toContain('2')
    expect(firstCard).toContain('5h 58m')
    expect(firstCard).toContain('86.6 g')
    expect(firstCard).toContain('€0.86')
  })

  it('shows a dash for a project without prints', async () => {
    const page = await mountPage(new FakeEnvironment())
    const lastCard = [...page.querySelectorAll('.project-card')][2]
    expect(lastCard.textContent?.replace(/\s+/g, ' ')).toContain('—')
  })

  it('shows the number of projects in the title strip', async () => {
    const page = await mountPage(new FakeEnvironment())
    expect(page.querySelector('.page-strip .project-count')?.textContent).toBe('3')
  })

  it('shows the totals of all projects', async () => {
    const page = await mountPage(new FakeEnvironment())
    expect(readTotal(page, 'projects')).toBe('3')
    expect(readTotal(page, 'prints')).toBe('7')
    expect(readTotal(page, 'filament')).toBe('213.1g')
    expect(readTotal(page, 'cost')).toBe('€2.76')
  })

  it('filters the cards by name while typing in the search field', async () => {
    const page = await mountPage(new FakeEnvironment())
    await typeQuery(page, 'door')
    expect(readCardNames(page)).toEqual(['Doorhandle'])
  })

  it('shows a message when no project matches the search', async () => {
    const page = await mountPage(new FakeEnvironment())
    await typeQuery(page, 'zzz')
    expect(readCardNames(page)).toEqual([])
    expect(page.querySelector('.projects-empty')?.textContent).toContain('No projects')
  })

  it('keeps the totals of all projects while filtering', async () => {
    const page = await mountPage(new FakeEnvironment())
    await typeQuery(page, 'door')
    expect(readTotal(page, 'projects')).toBe('3')
  })

  it('sorts by name', async () => {
    const environment = new FakeEnvironment()
    environment.projects = [PROJECTS[2], PROJECTS[1], PROJECTS[0]]
    const page = await mountPage(environment)
    await chooseOrder(page, 'name')
    expect(readCardNames(page)).toEqual(['Dactyl Manuform', 'Doorhandle', 'Voron 2.4'])
  })

  it('sorts by most prints', async () => {
    const page = await mountPage(new FakeEnvironment())
    await chooseOrder(page, 'prints')
    expect(readCardNames(page)).toEqual(['Doorhandle', 'Dactyl Manuform', 'Voron 2.4'])
  })

  it('opens the project when its card is clicked', async () => {
    const environment = new FakeEnvironment()
    const page = await mountPage(environment)
    ;(page.querySelectorAll('.project-card')[1] as HTMLElement).click()
    expect(environment.visitedPaths).toEqual(['/projects/2'])
  })

  it('creates a project with the trimmed name and opens it', async () => {
    const environment = new FakeEnvironment()
    environment.nameToGive = '  Benchy  '
    const page = await mountPage(environment)
    ;(page.querySelector('.new-project-button') as HTMLElement).click()
    await vi.waitFor(() => expect(environment.visitedPaths).toEqual(['/projects/42']))
    expect(environment.createdNames).toEqual(['Benchy'])
  })

  it('does not create a project when the name is empty or the question is cancelled', async () => {
    const environment = new FakeEnvironment()
    const page = await mountPage(environment)
    const button = page.querySelector('.new-project-button') as HTMLElement
    environment.nameToGive = '   '
    button.click()
    environment.nameToGive = null
    button.click()
    await page.updateComplete
    expect(environment.createdNames).toEqual([])
    expect(environment.visitedPaths).toEqual([])
  })
})

describe('projects-page before the projects have arrived', () => {
  function mountWithoutWaiting(loadProjects: () => Promise<Project[]>): ProjectsPage {
    const page = document.createElement('projects-page') as ProjectsPage
    page.loadProjects = loadProjects
    document.body.appendChild(page)
    mountedPages.push(page)
    return page
  }

  function readMessage(page: ProjectsPage): string {
    return page.querySelector('.projects-empty')?.textContent?.trim() ?? ''
  }

  it('says it is loading, and does not claim that there are no projects', async () => {
    const page = mountWithoutWaiting(() => new Promise(() => {}))
    await page.updateComplete
    expect(readMessage(page)).toBe('Loading projects…')
  })

  it('shows dashes for the totals and the count until the projects have arrived', async () => {
    const page = mountWithoutWaiting(() => new Promise(() => {}))
    await page.updateComplete
    expect(readTotal(page, 'projects')).toBe('—')
    expect(readTotal(page, 'prints')).toBe('—')
    expect(page.querySelector('.project-count')?.textContent?.trim()).toBe('—')
  })

  it('says the projects could not be loaded when the request fails', async () => {
    const page = mountWithoutWaiting(() => Promise.reject(new Error('502')))
    await vi.waitFor(() => expect(readMessage(page)).toBe('Could not load the projects'))
  })

  it('says there are no projects only after an empty answer', async () => {
    const page = mountWithoutWaiting(async () => [])
    await vi.waitFor(() => expect(readMessage(page)).toBe('No projects found'))
  })

  it('replaces the loading message with the cards when the answer arrives', async () => {
    let arrive: (projects: Project[]) => void = () => {}
    const page = mountWithoutWaiting(() => new Promise((resolve) => (arrive = resolve)))
    await page.updateComplete
    arrive(PROJECTS)
    await vi.waitFor(() => expect(readCardNames(page)).toEqual(['Dactyl Manuform', 'Doorhandle', 'Voron 2.4']))
    expect(readMessage(page)).toBe('')
  })
})
