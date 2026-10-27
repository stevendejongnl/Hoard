import { afterEach, describe, expect, it, vi } from 'vitest'
import './project-detail-page'
import type { ProjectDetailPage } from './project-detail-page'
import type { Project, ProjectLink } from '../types'

function createProject(overrides: Partial<Project>): Project {
  return {
    id: 7,
    name: 'Dactyl Manuform',
    notes: 'Printed in **PLA**',
    created_at: 0,
    print_count: 2,
    total_duration_s: 21480,
    avg_duration_s: 10740,
    max_duration_s: 10740,
    total_cost: 0.86,
    avg_cost: 0.43,
    total_filament_g: 86.6,
    cover_url: null,
    cover_link_id: null,
    files: [],
    links: [],
    prints: [],
    ...overrides,
  }
}

function createLink(identifier: number, url: string, title?: string): ProjectLink {
  return { id: identifier, project_id: 7, url, label: null, meta: title ? { title } : null }
}

class FakeProjectApi {
  project = createProject({})
  loadFails = false
  confirmAnswer = true
  confirmedMessages: string[] = []
  textAnswers: Array<string | null> = []
  deletedIdentifiers: number[] = []
  addedLinks: Array<{ url: string; label?: string }> = []
  removedLinks: Array<[number, boolean]> = []
  visitedPaths: string[] = []

  readProjectIdentifier = () => 7

  loadProject = async () => {
    if (this.loadFails) throw new Error('404 Not Found')
    return this.project
  }

  loadHistory = async () => []

  deleteProject = async (identifier: number) => {
    this.deletedIdentifiers.push(identifier)
  }

  addLink = async (_identifier: number, data: { url: string; label?: string }) => {
    this.addedLinks.push(data)
    return createLink(99, data.url, 'Fresh link')
  }

  removeLink = async (_identifier: number, linkIdentifier: number, clearCover: boolean) => {
    this.removedLinks.push([linkIdentifier, clearCover])
  }

  confirm = (message: string) => {
    this.confirmedMessages.push(message)
    return this.confirmAnswer
  }

  askText = () => this.textAnswers.shift() ?? null

  navigate = (path: string) => {
    this.visitedPaths.push(path)
  }
}

const mountedPages: ProjectDetailPage[] = []

async function mountPage(api: FakeProjectApi): Promise<ProjectDetailPage> {
  const page = document.createElement('project-detail-page') as ProjectDetailPage
  page.readProjectIdentifier = api.readProjectIdentifier
  page.loadProject = api.loadProject
  page.loadHistory = api.loadHistory
  page.deleteProject = api.deleteProject
  page.addLink = api.addLink
  page.removeLink = api.removeLink
  page.confirm = api.confirm
  page.askText = api.askText
  page.navigate = api.navigate
  document.body.appendChild(page)
  mountedPages.push(page)
  await vi.waitFor(() => expect(page.querySelector('.project-heading, .project-missing')).not.toBeNull())
  return page
}

function readTotal(page: ProjectDetailPage, total: string): string {
  return page.querySelector(`[data-total="${total}"]`)?.textContent?.replace(/\s+/g, '') ?? ''
}

afterEach(() => {
  mountedPages.splice(0).forEach((page) => page.remove())
})

describe('project-detail-page', () => {
  it('shows the name of the project', async () => {
    const page = await mountPage(new FakeProjectApi())
    expect(page.querySelector('.project-heading')?.textContent?.trim()).toBe('Dactyl Manuform')
  })

  it('shows the totals of the project', async () => {
    const page = await mountPage(new FakeProjectApi())
    expect(readTotal(page, 'prints')).toBe('2')
    expect(readTotal(page, 'total-time')).toBe('5h58m')
    expect(readTotal(page, 'average-time')).toBe('2h59m')
    expect(readTotal(page, 'filament')).toBe('86.6g')
    expect(readTotal(page, 'total-cost')).toBe('€0.86')
    expect(readTotal(page, 'average-cost')).toBe('€0.43')
  })

  it('shows dashes for a project without prints', async () => {
    const api = new FakeProjectApi()
    api.project = createProject({
      print_count: 0,
      total_duration_s: null,
      avg_duration_s: null,
      total_cost: null,
      avg_cost: null,
      total_filament_g: null,
    })
    const page = await mountPage(api)
    expect(readTotal(page, 'total-time')).toBe('—')
    expect(readTotal(page, 'total-cost')).toBe('—')
  })

  it('says the project was not found when it cannot be loaded', async () => {
    const api = new FakeProjectApi()
    api.loadFails = true
    const page = await mountPage(api)
    expect(page.querySelector('.project-missing')?.textContent).toContain('Project not found')
  })

  it('goes back to the list from the back link', async () => {
    const api = new FakeProjectApi()
    const page = await mountPage(api)
    ;(page.querySelector('.back-link') as HTMLElement).click()
    expect(api.visitedPaths).toEqual(['/projects'])
  })

  it('shows the cover image when the project has one', async () => {
    const api = new FakeProjectApi()
    api.project = createProject({ cover_url: '/covers/7.jpg' })
    const page = await mountPage(api)
    expect(page.querySelector('.project-cover')?.getAttribute('src')).toBe('/covers/7.jpg')
  })

  describe('deleting', () => {
    it('asks for confirmation with the name of the project', async () => {
      const api = new FakeProjectApi()
      api.confirmAnswer = false
      const page = await mountPage(api)
      ;(page.querySelector('.delete-project-button') as HTMLElement).click()
      expect(api.confirmedMessages[0]).toContain('Dactyl Manuform')
    })

    it('deletes nothing when the confirmation is refused', async () => {
      const api = new FakeProjectApi()
      api.confirmAnswer = false
      const page = await mountPage(api)
      ;(page.querySelector('.delete-project-button') as HTMLElement).click()
      await page.updateComplete
      expect(api.deletedIdentifiers).toEqual([])
      expect(api.visitedPaths).toEqual([])
    })

    it('deletes the project and returns to the list when confirmed', async () => {
      const api = new FakeProjectApi()
      const page = await mountPage(api)
      ;(page.querySelector('.delete-project-button') as HTMLElement).click()
      await vi.waitFor(() => expect(api.visitedPaths).toEqual(['/projects']))
      expect(api.deletedIdentifiers).toEqual([7])
    })
  })

  describe('links', () => {
    it('shows the title and the site of a link', async () => {
      const api = new FakeProjectApi()
      api.project = createProject({
        links: [createLink(1, 'https://www.printables.com/model/dactyl-manuform', 'Dactyl Manuform keyboard')],
      })
      const page = await mountPage(api)
      expect(page.querySelector('.link-title')?.textContent).toBe('Dactyl Manuform keyboard')
      expect(page.querySelector('.link-address')?.textContent).toBe('printables.com/…')
    })

    it('shows the address when a link has no title', async () => {
      const api = new FakeProjectApi()
      api.project = createProject({ links: [createLink(1, 'https://example.com/')] })
      const page = await mountPage(api)
      expect(page.querySelector('.link-title')?.textContent).toBe('https://example.com/')
      expect(page.querySelector('.link-address')?.textContent).toBe('example.com')
    })

    it('adds a link with the address and label that were asked for', async () => {
      const api = new FakeProjectApi()
      api.textAnswers = ['https://example.com/part', 'printables']
      const page = await mountPage(api)
      ;(page.querySelector('.add-link-button') as HTMLElement).click()
      await vi.waitFor(() => expect(page.querySelectorAll('.link-row')).toHaveLength(1))
      expect(api.addedLinks).toEqual([{ url: 'https://example.com/part', label: 'printables' }])
      expect(page.querySelector('.link-title')?.textContent).toBe('Fresh link')
    })

    it('adds nothing when no address is given', async () => {
      const api = new FakeProjectApi()
      api.textAnswers = ['   ']
      const page = await mountPage(api)
      ;(page.querySelector('.add-link-button') as HTMLElement).click()
      await page.updateComplete
      expect(api.addedLinks).toEqual([])
    })

    it('removes a link', async () => {
      const api = new FakeProjectApi()
      api.project = createProject({ links: [createLink(1, 'https://a.example/'), createLink(2, 'https://b.example/')] })
      const page = await mountPage(api)
      ;(page.querySelector('.link-remove') as HTMLElement).click()
      await vi.waitFor(() => expect(page.querySelectorAll('.link-row')).toHaveLength(1))
      expect(api.removedLinks).toEqual([[1, false]])
    })

    it('asks whether to remove the cover when the removed link provided it', async () => {
      const api = new FakeProjectApi()
      api.project = createProject({
        links: [createLink(1, 'https://a.example/')],
        cover_url: '/covers/7.jpg',
        cover_link_id: 1,
      })
      const page = await mountPage(api)
      ;(page.querySelector('.link-remove') as HTMLElement).click()
      await vi.waitFor(() => expect(api.removedLinks).toEqual([[1, true]]))
      expect(api.confirmedMessages[0]).toContain('cover')
      await page.updateComplete
      expect(page.querySelector('.project-cover')).toBeNull()
    })

    it('keeps the cover when asked to and the answer is no', async () => {
      const api = new FakeProjectApi()
      api.confirmAnswer = false
      api.project = createProject({
        links: [createLink(1, 'https://a.example/')],
        cover_url: '/covers/7.jpg',
        cover_link_id: 1,
      })
      const page = await mountPage(api)
      ;(page.querySelector('.link-remove') as HTMLElement).click()
      await vi.waitFor(() => expect(api.removedLinks).toEqual([[1, false]]))
      await page.updateComplete
      expect(page.querySelector('.project-cover')).not.toBeNull()
    })
  })
})
