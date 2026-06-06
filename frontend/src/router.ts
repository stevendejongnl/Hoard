type Route = '/' | '/history' | '/spools' | '/projects' | `/projects/${string}` | `/prints/${string}`

class Router {
  private listeners: Array<(r: Route) => void> = []

  get current(): Route {
    const p = window.location.pathname
    if (p === '/history') return '/history'
    if (p === '/spools') return '/spools'
    if (p === '/projects') return '/projects'
    if (p.startsWith('/projects/')) return p as `/projects/${string}`
    if (p.startsWith('/prints/')) return p as `/prints/${string}`
    return '/'
  }

  get projectId(): number | null {
    const p = window.location.pathname
    if (p.startsWith('/projects/')) {
      const id = parseInt(p.split('/')[2], 10)
      return isNaN(id) ? null : id
    }
    return null
  }

  get printJobId(): string | null {
    const p = window.location.pathname
    if (p.startsWith('/prints/')) {
      return decodeURIComponent(p.slice('/prints/'.length)) || null
    }
    return null
  }

  navigate(path: Route): void {
    window.history.pushState({}, '', path)
    this.listeners.forEach((l) => l(this.current))
  }

  listen(fn: (r: Route) => void): () => void {
    this.listeners.push(fn)
    window.addEventListener('popstate', () => fn(this.current))
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }
}

export const router = new Router()

declare global {
  interface Window {
    router: Router
  }
}
window.router = router
