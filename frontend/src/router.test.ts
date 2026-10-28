import { describe, expect, it } from 'vitest'
import { createRouter } from './router'
import type { RouterEnvironment } from './router'

class FakeEnvironment implements RouterEnvironment {
  pathname: string
  pushedPaths: string[] = []
  private historyListeners: (() => void)[] = []
  removedListeners = 0

  constructor(pathname = '/') {
    this.pathname = pathname
  }

  readPathname(): string {
    return this.pathname
  }

  pushPath(path: string): void {
    this.pushedPaths.push(path)
    this.pathname = path
  }

  listenToHistoryChanges(listener: () => void): () => void {
    this.historyListeners.push(listener)
    return () => {
      this.historyListeners = this.historyListeners.filter((registered) => registered !== listener)
      this.removedListeners += 1
    }
  }

  goBackTo(pathname: string): void {
    this.pathname = pathname
    this.historyListeners.forEach((listener) => listener())
  }

  get listenerCount(): number {
    return this.historyListeners.length
  }
}

describe('the current route', () => {
  it.each([
    ['/', '/'],
    ['/history', '/history'],
    ['/spools', '/spools'],
    ['/projects', '/projects'],
    ['/projects/7', '/projects/7'],
    ['/prints/job-1', '/prints/job-1'],
    ['/something-else', '/'],
  ])('is %s for the path %s', (pathname, expected) => {
    expect(createRouter(new FakeEnvironment(pathname)).current).toBe(expected)
  })
})

describe('the project and the print of the path', () => {
  it('reads the number of a project', () => {
    expect(createRouter(new FakeEnvironment('/projects/7')).projectId).toBe(7)
  })

  it('has no project for a path that is not a project, or has no number', () => {
    expect(createRouter(new FakeEnvironment('/history')).projectId).toBeNull()
    expect(createRouter(new FakeEnvironment('/projects/abc')).projectId).toBeNull()
  })

  it('reads the id of a print, decoded', () => {
    expect(createRouter(new FakeEnvironment('/prints/job%201')).printJobId).toBe('job 1')
  })

  it('has no print for a path that is not a print, or has no id', () => {
    expect(createRouter(new FakeEnvironment('/history')).printJobId).toBeNull()
    expect(createRouter(new FakeEnvironment('/prints/')).printJobId).toBeNull()
  })
})

describe('going to a route', () => {
  it('pushes the path and tells the listeners the new route', () => {
    const environment = new FakeEnvironment('/')
    const router = createRouter(environment)
    const heard: string[] = []
    router.listen((route) => heard.push(route))
    router.navigate('/spools')
    expect(environment.pushedPaths).toEqual(['/spools'])
    expect(heard).toEqual(['/spools'])
  })
})

describe('listening', () => {
  it('tells the listener the route when the person goes back', () => {
    const environment = new FakeEnvironment('/spools')
    const router = createRouter(environment)
    const heard: string[] = []
    router.listen((route) => heard.push(route))
    environment.goBackTo('/history')
    expect(heard).toEqual(['/history'])
  })

  it('stops telling a listener that has stopped, and lets go of the browser as well', () => {
    const environment = new FakeEnvironment('/')
    const router = createRouter(environment)
    const heard: string[] = []
    const stop = router.listen((route) => heard.push(route))
    stop()
    router.navigate('/history')
    environment.goBackTo('/spools')
    expect(heard).toEqual([])
    expect(environment.listenerCount).toBe(0)
  })

  it('keeps the other listeners when one stops', () => {
    const environment = new FakeEnvironment('/')
    const router = createRouter(environment)
    const first: string[] = []
    const second: string[] = []
    const stopFirst = router.listen((route) => first.push(route))
    router.listen((route) => second.push(route))
    stopFirst()
    router.navigate('/history')
    expect(first).toEqual([])
    expect(second).toEqual(['/history'])
  })
})
