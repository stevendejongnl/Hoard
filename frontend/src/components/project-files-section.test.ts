import { afterEach, describe, expect, it, vi } from 'vitest'
import './project-files-section'
import type { ProjectFilesSection } from './project-files-section'
import type { ProjectFile } from '../types'

function createFile(overrides: Partial<ProjectFile>): ProjectFile {
  return { id: 1, project_id: 7, type: 'gcode', filename: 'plate.gcode', label: null, ...overrides }
}

class FakeProjectFiles {
  gcodeFilenames = ['plate.gcode', 'folder/lid.gcode']
  linkedFilenames: string[] = []
  uploadedNames: string[] = []
  removedIdentifiers: number[] = []

  listGcodeFiles = async () => this.gcodeFilenames

  linkGcodeFile = async (filename: string) => {
    this.linkedFilenames.push(filename)
    return createFile({ id: 10, filename })
  }

  uploadStl = async (file: File) => {
    this.uploadedNames.push(file.name)
    return createFile({ id: 11, type: 'stl', filename: file.name, label: file.name })
  }

  removeFile = async (fileIdentifier: number) => {
    this.removedIdentifiers.push(fileIdentifier)
  }
}

const mountedSections: ProjectFilesSection[] = []

async function mountSection(project: FakeProjectFiles, files: ProjectFile[]): Promise<ProjectFilesSection> {
  const section = document.createElement('project-files-section') as ProjectFilesSection
  section.files = files
  section.listGcodeFiles = project.listGcodeFiles
  section.linkGcodeFile = project.linkGcodeFile
  section.uploadStl = project.uploadStl
  section.removeFile = project.removeFile
  document.body.appendChild(section)
  mountedSections.push(section)
  await section.updateComplete
  return section
}

function listenForChanges(section: ProjectFilesSection): ProjectFile[][] {
  const changes: ProjectFile[][] = []
  section.addEventListener('files-changed', (event) => changes.push((event as CustomEvent).detail))
  return changes
}

function findButton(section: ProjectFilesSection, label: string): HTMLButtonElement {
  const buttons = [...section.querySelectorAll('button')]
  return buttons.find((button) => button.textContent?.includes(label)) as HTMLButtonElement
}

afterEach(() => {
  mountedSections.splice(0).forEach((section) => section.remove())
})

describe('project-files-section', () => {
  it('lists the files by name without their folder', async () => {
    const files = [createFile({ id: 1, filename: 'folder/plate.gcode' }), createFile({ id: 2, label: 'Gear' })]
    const section = await mountSection(new FakeProjectFiles(), files)
    const names = [...section.querySelectorAll('.file-name')].map((name) => name.textContent?.trim())
    expect(names).toEqual(['plate.gcode', 'Gear'])
  })

  it('says what kind of file each one is', async () => {
    const files = [createFile({ id: 1 }), createFile({ id: 2, type: 'stl', filename: 'gear.stl' })]
    const section = await mountSection(new FakeProjectFiles(), files)
    const kinds = [...section.querySelectorAll('.file-kind')].map((kind) => kind.textContent?.trim())
    expect(kinds).toEqual(['G-code · linked', 'STL'])
  })

  it('says there are no files yet when the project has none', async () => {
    const section = await mountSection(new FakeProjectFiles(), [])
    expect(section.querySelector('.panel-body')?.textContent).toContain('No files yet')
  })

  it('offers the gcode files of the printer to link', async () => {
    const section = await mountSection(new FakeProjectFiles(), [])
    findButton(section, 'Link G-code').click()
    await vi.waitFor(() => expect(section.querySelectorAll('.gcode-choice')).toHaveLength(2))
  })

  it('says so when the printer has no gcode files', async () => {
    const project = new FakeProjectFiles()
    project.gcodeFilenames = []
    const section = await mountSection(project, [])
    findButton(section, 'Link G-code').click()
    await vi.waitFor(() => expect(section.querySelector('.gcode-picker')?.textContent).toContain('No G-code files'))
  })

  it('links the chosen gcode file, reports the new list and closes the picker', async () => {
    const project = new FakeProjectFiles()
    const section = await mountSection(project, [createFile({ id: 1 })])
    const changes = listenForChanges(section)
    findButton(section, 'Link G-code').click()
    await vi.waitFor(() => expect(section.querySelectorAll('.gcode-choice')).toHaveLength(2))
    ;(section.querySelectorAll('.gcode-choice')[1] as HTMLElement).click()
    await vi.waitFor(() => expect(changes).toHaveLength(1))
    expect(project.linkedFilenames).toEqual(['folder/lid.gcode'])
    expect(changes[0].map((file) => file.id)).toEqual([1, 10])
    await section.updateComplete
    expect(section.querySelector('.gcode-picker')).toBeNull()
  })

  it('uploads a chosen model file and reports the new list', async () => {
    const project = new FakeProjectFiles()
    const section = await mountSection(project, [])
    const changes = listenForChanges(section)
    const input = section.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['solid'], 'gear.stl')
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(changes).toHaveLength(1))
    expect(project.uploadedNames).toEqual(['gear.stl'])
    expect(changes[0][0].filename).toBe('gear.stl')
  })

  it('removes a file and reports the remaining list', async () => {
    const project = new FakeProjectFiles()
    const section = await mountSection(project, [createFile({ id: 1 }), createFile({ id: 2, filename: 'b.gcode' })])
    const changes = listenForChanges(section)
    ;(section.querySelectorAll('.file-remove')[0] as HTMLElement).click()
    await vi.waitFor(() => expect(changes).toHaveLength(1))
    expect(project.removedIdentifiers).toEqual([1])
    expect(changes[0].map((file) => file.id)).toEqual([2])
  })
})
