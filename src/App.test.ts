import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountMibliotecaApp } from './App'
import { openShelfwalkDb, putScan, putSession, type ShelfwalkDatabase } from './tracer'

let container: HTMLDivElement
let db: ShelfwalkDatabase
let dispose: (() => void) | undefined
let mockGetUserMedia: ReturnType<typeof vi.fn>

function okScanResponse(overrides: Partial<{
  scanId: string
  sessionId: string
  userId: string
  shortCode: string
  joinToken: string
  serverTimeMs: number
}> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      scanId: 'scan-quick',
      sessionId: 'session-quick',
      userId: 'user-quick',
      shortCode: 'FAST-123',
      joinToken: 'join-token',
      serverTimeMs: 1_000,
      ...overrides,
    }),
  }
}

beforeEach(async () => {
  mockGetUserMedia = vi.fn(() => new Promise(() => {}))
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    configurable: true,
  })

  container = document.createElement('div')
  document.body.append(container)
  db = await openShelfwalkDb(`app-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  sessionStorage.clear()
  window.location.hash = '/'
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  db.close()
  container.remove()
  sessionStorage.clear()
  window.location.hash = ''
})

describe('mountMibliotecaApp', () => {
  it('shows quick-start home actions on the home route', async () => {
    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('heading', { name: /sessions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start scanning' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument()
  })

  it('shows pending quick-start state and prevents duplicate create clicks', async () => {
    let resolveFetch: ((value: ReturnType<typeof okScanResponse>) => void) | undefined
    const fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve })
    )

    dispose = mountMibliotecaApp(container, { openDb: async () => db, fetch, now: () => 1_000 })

    await userEvent.click(await screen.findByRole('button', { name: 'Start scanning' }))

    const pendingButton = await screen.findByRole('button', { name: 'Starting camera…' })
    expect(pendingButton).toBeDisabled()
    expect(fetch).toHaveBeenCalledOnce()
    expect(window.location.hash).toBe('#/')

    await userEvent.click(pendingButton)
    expect(fetch).toHaveBeenCalledOnce()

    resolveFetch?.(okScanResponse())
    expect(await screen.findByText('Allow camera access to photograph shelf spines.')).toBeInTheDocument()
  })

  it('shows recovery error and restores Start scanning after quick-start failure', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    dispose = mountMibliotecaApp(container, { openDb: async () => db, fetch, now: () => 1_000 })

    await userEvent.click(await screen.findByRole('button', { name: 'Start scanning' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t start scan. Check connection/storage and try again.')
    expect(screen.getByRole('button', { name: 'Start scanning' })).toBeEnabled()
    expect(window.location.hash).toBe('#/')
  })

  it('shows the same recovery error when local persistence fails after create succeeds', async () => {
    const fetch = vi.fn().mockResolvedValue(okScanResponse())
    const putSpy = vi.spyOn(db, 'put')
    putSpy
      .mockResolvedValueOnce('scan-quick' as never)
      .mockRejectedValueOnce(new Error('session put failed'))

    dispose = mountMibliotecaApp(container, { openDb: async () => db, fetch, now: () => 1_000 })

    await userEvent.click(await screen.findByRole('button', { name: 'Start scanning' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t start scan. Check connection/storage and try again.')
    expect(screen.getByRole('button', { name: 'Start scanning' })).toBeEnabled()
    expect(window.location.hash).toBe('#/')
  })

  it('reuses persisted quick-start session evidence on retry instead of creating a duplicate scan', async () => {
    await putScan(db, {
      id: 'scan-saved',
      shortCode: 'SAVE-001',
      joinToken: 'saved-token',
      createdAt: '2026-05-07T10:00:00.000Z',
    })
    await putSession(db, {
      id: 'session-saved',
      scanId: 'scan-saved',
      userId: 'user-saved',
      startedAt: '2026-05-07T10:01:00.000Z',
      clockOffsetMs: 0,
      status: 'active',
    })
    sessionStorage.setItem('miblioteca.quick-start-session-id', 'session-saved')

    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    dispose = mountMibliotecaApp(container, { openDb: async () => db, fetch, now: () => 1_000 })

    await userEvent.click(await screen.findByRole('button', { name: 'Start scanning' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t start scan. Check connection/storage and try again.')
    expect(fetch).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'Start scanning' }))

    expect(fetch).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: /open camera/i })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/session/session-saved')
  })

  it('creates an unnamed quick-start scan, opens the session route, and starts camera permission flow', async () => {
    const fetch = vi.fn().mockResolvedValue(okScanResponse())

    dispose = mountMibliotecaApp(container, { openDb: async () => db, fetch, now: () => 1_000 })

    await userEvent.click(await screen.findByRole('button', { name: 'Start scanning' }))

    expect(fetch).toHaveBeenCalledOnce()
    const [, init] = fetch.mock.calls[0]
    expect(JSON.parse(init.body as string)).toEqual({ clientTimeMs: 1_000 })
    expect(await screen.findByText('Allow camera access to photograph shelf spines.')).toBeInTheDocument()
    expect(mockGetUserMedia).toHaveBeenCalledOnce()
    expect(window.location.hash).toBe('#/session/session-quick')
  })

  it('returns home from denied quick-start camera with Start scanning enabled and prior session visible', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    const fetch = vi.fn().mockResolvedValue(okScanResponse())

    dispose = mountMibliotecaApp(container, { openDb: async () => db, fetch, now: () => 1_000 })

    await userEvent.click(await screen.findByRole('button', { name: 'Start scanning' }))

    expect(await screen.findByText('Camera access is required to photograph shelf spines.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /back to sessions/i }))

    expect(await screen.findByRole('button', { name: 'Start scanning' })).toBeEnabled()
    expect(screen.getByRole('heading', { name: 'Previous scans' })).toBeInTheDocument()
    expect(await screen.findByText('Pending')).toBeInTheDocument()
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
