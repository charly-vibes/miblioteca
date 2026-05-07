export type Route = { kind: 'home' } | { kind: 'session'; sessionId: string }

export function parseRoute(): Route {
  const hash = window.location.hash.slice(1)
  const match = /^\/session\/([^/]+)$/.exec(hash)
  if (match) return { kind: 'session', sessionId: match[1] }
  return { kind: 'home' }
}

export function navigateToSession(sessionId: string): void {
  window.location.hash = `/session/${sessionId}`
}

export function navigateHome(): void {
  window.location.hash = '/'
}
