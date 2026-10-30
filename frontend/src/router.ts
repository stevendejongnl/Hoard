export type Route = '/' | '/history' | '/spools' | '/system' | '/projects' | `/projects/${string}` | `/prints/${string}`

/** What the router needs from the browser, so a test can hand it a fake one. */
export interface RouterEnvironment {
  readPathname(): string
  pushPath(path: string): void
  /** returns the function that stops listening */
  listenToHistoryChanges(listener: () => void): () => void
}

const PROJECT_PREFIX = '/projects/'
const PRINT_PREFIX = '/prints/'

export const browserEnvironment: RouterEnvironment = {
  readPathname: () => window.location.pathname,
  pushPath: (path) => window.history.pushState({}, '', path),
  listenToHistoryChanges: (listener) => {
    window.addEventListener('popstate', listener)
    return () => window.removeEventListener('popstate', listener)
  },
}

export class Router {
  private listeners: Array<(route: Route) => void> = []

  constructor(private readonly environment: RouterEnvironment) {}

  get current(): Route {
    const pathname = this.environment.readPathname()
    if (pathname === '/history') return '/history'
    if (pathname === '/spools') return '/spools'
    if (pathname === '/system') return '/system'
    if (pathname === '/projects') return '/projects'
    if (pathname.startsWith(PROJECT_PREFIX)) return pathname as `/projects/${string}`
    if (pathname.startsWith(PRINT_PREFIX)) return pathname as `/prints/${string}`
    return '/'
  }

  get projectId(): number | null {
    const pathname = this.environment.readPathname()
    if (!pathname.startsWith(PROJECT_PREFIX)) return null
    const id = parseInt(pathname.split('/')[2], 10)
    return isNaN(id) ? null : id
  }

  get printJobId(): string | null {
    const pathname = this.environment.readPathname()
    if (!pathname.startsWith(PRINT_PREFIX)) return null
    return decodeURIComponent(pathname.slice(PRINT_PREFIX.length)) || null
  }

  navigate(path: Route): void {
    this.environment.pushPath(path)
    this.listeners.forEach((listener) => listener(this.current))
  }

  listen(listener: (route: Route) => void): () => void {
    this.listeners.push(listener)
    const stopListeningToHistory = this.environment.listenToHistoryChanges(() => listener(this.current))
    return () => {
      this.listeners = this.listeners.filter((registered) => registered !== listener)
      stopListeningToHistory()
    }
  }
}

export function createRouter(environment: RouterEnvironment = browserEnvironment): Router {
  return new Router(environment)
}

export const router = createRouter()

declare global {
  interface Window {
    router: Router
  }
}
window.router = router
