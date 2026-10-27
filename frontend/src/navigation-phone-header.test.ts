import { describe, expect, it } from 'vitest'
import { describePhoneHeader } from './navigation'

describe('describePhoneHeader', () => {
  it.each([
    ['/', 'Hoard'],
    ['/history', 'History'],
    ['/prints/job-001', 'History'],
    ['/projects', 'Projects'],
    ['/spools', 'Spools'],
    ['/something-unknown', 'Hoard'],
  ])('titles %s as %s without a back link', (route, title) => {
    expect(describePhoneHeader(route)).toEqual({ title, backPath: null })
  })

  it('titles a project as Project with a way back to the list', () => {
    expect(describePhoneHeader('/projects/1')).toEqual({ title: 'Project', backPath: '/projects' })
  })
})
