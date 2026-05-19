import { screen } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountMibliotecaApp } from './App'
import { openShelfwalkDb, putScan, putSession, type ShelfwalkDatabase } from './tracer'

let container: HTMLDivElement
let db: ShelfwalkDatabase
let dispose: (() => void) | undefined

beforeEach(async () => {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  })

  container = document.createElement('div')
  document.body.append(container)
  db = await openShelfwalkDb(`app-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  // Reset to home route
  window.location.hash = '/'
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  db.close()
  container.remove()
  window.location.hash = ''
})

describe('mountMibliotecaApp', () => {
  it('shows sessions list on the home route', async () => {
    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('heading', { name: /sessions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new scan/i })).toBeInTheDocument()
  })

  it('shows scan management on the #/new route', async () => {
    window.location.hash = '/new'
    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('heading', { name: /start a shelf scan/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /join a scan/i })).toBeInTheDocument()
  })

  it('shows back button on the #/new route', async () => {
    window.location.hash = '/new'
    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('button', { name: /back to sessions/i })).toBeInTheDocument()
  })

  it('shows CaptureView when hash route points to a valid session', async () => {
    await putScan(db, {
      id: 'scan-nav',
      shortCode: 'NAV-001',
      joinToken: 'nav-token',
      createdAt: '2026-05-07T10:00:00.000Z',
    })
    await putSession(db, {
      id: 'session-nav',
      scanId: 'scan-nav',
      userId: 'user-nav',
      startedAt: '2026-05-07T10:01:00.000Z',
      clockOffsetMs: 0,
      status: 'active',
    })

    window.location.hash = '/session/session-nav'
    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('button', { name: /open camera/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /start a shelf scan/i })).not.toBeInTheDocument()
  })

  it('shows back button when navigated to a session', async () => {
    await putScan(db, {
      id: 'scan-back',
      shortCode: 'BCK-001',
      joinToken: 'back-token',
      createdAt: '2026-05-07T10:00:00.000Z',
    })
    await putSession(db, {
      id: 'session-back',
      scanId: 'scan-back',
      userId: 'user-back',
      startedAt: '2026-05-07T10:01:00.000Z',
      clockOffsetMs: 0,
      status: 'active',
    })

    window.location.hash = '/session/session-back'
    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('button', { name: /back to sessions/i })).toBeInTheDocument()
  })

  it('falls back to home when session ID does not exist in DB', async () => {
    window.location.hash = '/session/nonexistent-id'
    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('heading', { name: /sessions/i })).toBeInTheDocument()
  })

  it('navigates to CaptureView when hash changes to a session route after mount', async () => {
    await putScan(db, {
      id: 'scan-live',
      shortCode: 'LIVE-01',
      joinToken: 'live-token',
      createdAt: '2026-05-07T10:00:00.000Z',
    })
    await putSession(db, {
      id: 'session-live',
      scanId: 'scan-live',
      userId: 'user-live',
      startedAt: '2026-05-07T10:01:00.000Z',
      clockOffsetMs: 0,
      status: 'active',
    })

    dispose = mountMibliotecaApp(container, { openDb: async () => db })
    expect(await screen.findByRole('heading', { name: /sessions/i })).toBeInTheDocument()

    window.location.hash = '/session/session-live'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(await screen.findByRole('button', { name: /open camera/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sessions/i })).not.toBeInTheDocument()
  })
})
