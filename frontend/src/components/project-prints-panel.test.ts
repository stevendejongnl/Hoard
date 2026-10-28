import { afterEach, describe, expect, it, vi } from 'vitest'
import './project-prints-panel'
import type { ProjectPrintsPanel } from './project-prints-panel'
import type { PrintRecord, ProjectFile, ProjectPrint } from '../types'

function createRecord(jobIdentifier: string, filename: string, time: string): PrintRecord {
  return {
    job_id: jobIdentifier,
    time,
    filename,
    duration_s: 10740,
    filament_g: 43.3,
    avg_watts: null,
    avg_eur_per_kwh: null,
    cost_electricity: null,
    cost_filament: null,
    cost_total: 0.43,
    spool_id: null,
    material: null,
    spool: null,
  }
}

function createPrint(jobIdentifier: string): ProjectPrint {
  return {
    id: 1,
    project_id: 7,
    project_file_id: 3,
    job_id: jobIdentifier,
    duration_s: 10740,
    filament_g: 43.3,
    cost_total: 0.43,
  }
}

const RECORDS = [
  createRecord('job-a', 'folder/plate-r.gcode', '2026-05-22T12:00:00+00:00'),
  createRecord('job-b', 'plate.gcode', '2026-05-21T12:00:00+00:00'),
  createRecord('job-c', 'other.gcode', '2026-05-20T12:00:00+00:00'),
]

const FILES: ProjectFile[] = [
  { id: 3, project_id: 7, type: 'gcode', filename: 'plate.gcode', label: null },
  { id: 4, project_id: 7, type: 'stl', filename: 'plate.stl', label: null },
]

class FakeProjectPrints {
  linked: Array<[string, number | undefined]> = []
  unlinked: string[] = []
  visitedPaths: string[] = []

  loadHistory = async () => RECORDS

  linkPrint = async (jobIdentifier: string, fileIdentifier?: number) => {
    this.linked.push([jobIdentifier, fileIdentifier])
  }

  unlinkPrint = async (jobIdentifier: string) => {
    this.unlinked.push(jobIdentifier)
  }

  navigate = (path: string) => {
    this.visitedPaths.push(path)
  }
}

const mountedPanels: ProjectPrintsPanel[] = []

async function mountPanel(project: FakeProjectPrints, prints: ProjectPrint[]): Promise<ProjectPrintsPanel> {
  const panel = document.createElement('project-prints-panel') as ProjectPrintsPanel
  panel.prints = prints
  panel.files = FILES
  panel.loadHistory = project.loadHistory
  panel.linkPrint = project.linkPrint
  panel.unlinkPrint = project.unlinkPrint
  panel.navigate = project.navigate
  document.body.appendChild(panel)
  mountedPanels.push(panel)
  await panel.updateComplete
  return panel
}

async function openPicker(panel: ProjectPrintsPanel): Promise<void> {
  ;(panel.querySelector('.add-print-button') as HTMLElement).click()
  await vi.waitFor(() => expect(panel.querySelectorAll('.print-choice')).toHaveLength(3))
}

function readChoiceStates(panel: ProjectPrintsPanel): boolean[] {
  return [...panel.querySelectorAll('.print-choice')].map((choice) => choice.classList.contains('linked'))
}

afterEach(() => {
  mountedPanels.splice(0).forEach((panel) => panel.remove())
})

describe('project-prints-panel', () => {
  it('shows each print with its file, date, duration and cost', async () => {
    const panel = await mountPanel(new FakeProjectPrints(), [createPrint('job-a')])
    await vi.waitFor(() => expect(panel.querySelector('.print-name')?.textContent).toBe('plate-r.gcode'))
    expect(panel.querySelector('.print-details')?.textContent).toBe('22 May · 2h 59m · €0.43')
  })

  it('falls back to the job when the print is not in the history', async () => {
    const panel = await mountPanel(new FakeProjectPrints(), [createPrint('job-gone')])
    await vi.waitFor(() => expect(panel.querySelector('.print-name')?.textContent).toBe('job-gone'))
  })

  it('opens the print when its row is clicked', async () => {
    const project = new FakeProjectPrints()
    const panel = await mountPanel(project, [createPrint('job-a')])
    ;(panel.querySelector('.print-row') as HTMLElement).click()
    expect(project.visitedPaths).toEqual(['/prints/job-a'])
  })

  it('says there are no prints yet', async () => {
    const panel = await mountPanel(new FakeProjectPrints(), [])
    expect(panel.textContent).toContain('No prints yet')
  })

  it('lists the history in the picker and marks the prints already in the project', async () => {
    const panel = await mountPanel(new FakeProjectPrints(), [createPrint('job-b')])
    await openPicker(panel)
    expect(readChoiceStates(panel)).toEqual([false, true, false])
  })

  it('adds a print to the project, with the G-code file of the same name', async () => {
    const project = new FakeProjectPrints()
    const panel = await mountPanel(project, [])
    await openPicker(panel)
    ;(panel.querySelectorAll('.print-choice')[1] as HTMLElement).click()
    await vi.waitFor(() => expect(project.linked).toEqual([['job-b', 3]]))
    await panel.updateComplete
    expect(readChoiceStates(panel)).toEqual([false, true, false])
  })

  it('adds a print without a file when no G-code file has its name', async () => {
    const project = new FakeProjectPrints()
    const panel = await mountPanel(project, [])
    await openPicker(panel)
    ;(panel.querySelectorAll('.print-choice')[2] as HTMLElement).click()
    await vi.waitFor(() => expect(project.linked).toEqual([['job-c', undefined]]))
  })

  it('removes a print that is already in the project', async () => {
    const project = new FakeProjectPrints()
    const panel = await mountPanel(project, [createPrint('job-b')])
    await openPicker(panel)
    ;(panel.querySelectorAll('.print-choice')[1] as HTMLElement).click()
    await vi.waitFor(() => expect(project.unlinked).toEqual(['job-b']))
    await panel.updateComplete
    expect(readChoiceStates(panel)).toEqual([false, false, false])
  })

  it('reports a change when the picker closes after prints were added', async () => {
    const panel = await mountPanel(new FakeProjectPrints(), [])
    const reports: number[] = []
    panel.addEventListener('prints-changed', () => reports.push(1))
    await openPicker(panel)
    ;(panel.querySelectorAll('.print-choice')[0] as HTMLElement).click()
    await vi.waitFor(() => expect(readChoiceStates(panel)[0]).toBe(true))
    ;(panel.querySelector('.picker-done-button') as HTMLElement).click()
    await panel.updateComplete
    expect(reports).toHaveLength(1)
    expect(panel.querySelector('.print-picker')).toBeNull()
  })

  it('reports nothing when the picker closes without a change', async () => {
    const panel = await mountPanel(new FakeProjectPrints(), [])
    const reports: number[] = []
    panel.addEventListener('prints-changed', () => reports.push(1))
    await openPicker(panel)
    ;(panel.querySelector('.picker-done-button') as HTMLElement).click()
    await panel.updateComplete
    expect(reports).toHaveLength(0)
  })
})
