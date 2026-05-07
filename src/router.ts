export type Route = { kind: 'home' } | { kind: 'new-scan' } | { kind: 'session'; sessionId: string }

export function parseRoute(): Route {
  const hash = window.location.hash.slice(1)
  const sessionMatch = /^\/session\/([^/]+)$/.exec(hash)
  if (sessionMatch) return { kind: 'session', sessionId: sessionMatch[1] }
  if (hash === '/new') return { kind: 'new-scan' }
  return { kind: 'home' }
}

export function navigateToSession(sessionId: string): void {
  window.location.hash = `/session/${sessionId}`
}

export function navigateHome(): void {
  window.location.hash = '/'
}

export function navigateToNewScan(): void {
  window.location.hash = '/new'
}
