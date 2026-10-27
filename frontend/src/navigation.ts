export type NavigationSection = 'dashboard' | 'history' | 'projects' | 'spools'
export type NavigationPath = '/' | '/history' | '/projects' | '/spools'

export interface NavigationItem {
  section: NavigationSection
  path: NavigationPath
  label: string
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { section: 'dashboard', path: '/', label: 'Dashboard' },
  { section: 'history', path: '/history', label: 'History' },
  { section: 'projects', path: '/projects', label: 'Projects' },
  { section: 'spools', path: '/spools', label: 'Spools' },
]

/** The section of the navigation a route belongs to; unknown routes belong to the dashboard. */
export function findNavigationSection(route: string): NavigationSection {
  if (route === '/history' || route.startsWith('/prints/')) return 'history'
  if (route.startsWith('/projects')) return 'projects'
  if (route === '/spools') return 'spools'
  return 'dashboard'
}

function isModifiedClick(click: MouseEvent): boolean {
  return click.metaKey || click.ctrlKey || click.shiftKey || click.button === 1
}

/** Navigates in the app without reloading, but leaves clicks that open a new tab or window to the browser. */
export function followNavigationLink(click: MouseEvent, path: string, navigate: (path: string) => void): void {
  if (isModifiedClick(click)) return
  click.preventDefault()
  navigate(path)
}
