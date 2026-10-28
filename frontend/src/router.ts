type Route = '/' | '/history' | '/spools' | '/projects' | `/projects/${string}` | `/prints/${string}`

class Router {
  private listeners: Array<(route: Route) => void> = []

  get current(): Route {
    const pathname = window.location.pathname
    if (pathname === '/history') return '/history'
    if (pathname === '/spools') return '/spools'
    if (pathname === '/projects') return '/projects'
    if (pathname.startsWith('/projects/')) return pathname as `/projects/${string}`
    if (pathname.startsWith('/prints/')) return pathname as `/prints/${string}`
    return '/'
  }

  get projectId(): number | null {
    const pathname = window.location.pathname
    if (pathname.startsWith('/projects/')) {
      const id = parseInt(pathname.split('/')[2], 10)
      return isNaN(id) ? null : id
    }
    return null
  }

  get printJobId(): string | null {
    const pathname = window.location.pathname
    if (pathname.startsWith('/prints/')) {
      return decodeURIComponent(pathname.slice('/prints/'.length)) || null
    }
    return null
  }

  navigate(path: Route): void {
    window.history.pushState({}, '', path)
    this.listeners.forEach((listener) => listener(this.current))
  }

  listen(listener: (route: Route) => void): () => void {
    this.listeners.push(listener)
    window.addEventListener('popstate', () => listener(this.current))
    return () => {
      this.listeners = this.listeners.filter((registered) => registered !== listener)
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
