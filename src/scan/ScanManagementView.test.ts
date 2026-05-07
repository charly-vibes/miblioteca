import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openShelfwalkDb, type ShelfwalkDatabase } from '../tracer/persistence'
import { mountScanManagementView } from './ScanManagementView'

function makeFetch(status: number, body: object) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

const CREATE_RESPONSE = {
  scanId: 'scan-abc',
  sessionId: 'sess-host',
  userId: 'host-user',
  shortCode: 'BARN-7K9',
  joinToken: 'deadbeef'.repeat(8),
  serverTimeMs: 1_000,
}

const JOIN_RESPONSE = {
  scanId: 'scan-joined',
  sessionId: 'sess-join',
  userId: 'user-join',
  shortCode: 'JOIN-7K9',
  serverTimeMs: 1_000,
}

describe('mountScanManagementView', () => {
  let container: HTMLDivElement
  let db: ShelfwalkDatabase

  beforeEach(async () => {
    container = document.createElement('div')
    document.body.append(container)
    db = await openShelfwalkDb(`scan-management-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  })

  afterEach(() => {
    db.close()
    container.remove()
  })

  it('creates a scan, shows QR invite details, and emits a ready bootstrap result', async () => {
    const fetch = makeFetch(200, CREATE_RESPONSE)
    const onReady = vi.fn()
    mountScanManagementView(container, {
      fetch,
      openDb: async () => db,
      now: () => 1_250,
      baseUrl: 'https://example.com/miblioteca',
      onReady,
    })

    await userEvent.type(screen.getByLabelText(/scan name/i), 'Main library')
    await userEvent.click(screen.getByRole('button', { name: /create scan/i }))

    await screen.findByText('BARN-7K9')
    expect(container.querySelector('svg')).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith('/api/scan', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(fetch.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ clientTimeMs: 1_250, name: 'Main library' })
    expect(onReady).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /continue to camera/i }))

    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({
        resumed: false,
        scan: expect.objectContaining({ id: 'scan-abc', shortCode: 'BARN-7K9' }),
        session: expect.objectContaining({ id: 'sess-host', scanId: 'scan-abc', userId: 'host-user' }),
      })
    )
  })

  it('maps scan-create 409 conflicts to an inline name-taken error', async () => {
    mountScanManagementView(container, {
      fetch: makeFetch(409, { error: 'exists' }),
      openDb: async () => db,
      onReady: vi.fn(),
    })

    await userEvent.type(screen.getByLabelText(/scan name/i), 'Duplicate')
    await userEvent.click(screen.getByRole('button', { name: /create scan/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/name already taken/i)).toBeInTheDocument()
    })
  })

  it('prefills invite token from the QR URL and joins a scan', async () => {
    const fetch = makeFetch(200, JOIN_RESPONSE)
    const onReady = vi.fn()
    mountScanManagementView(container, {
      fetch,
      openDb: async () => db,
      search: '?t=token-from-qr',
      now: () => 1_500,
      onReady,
    })

    await userEvent.type(screen.getByLabelText(/short code/i), 'JOIN-7K9')
    expect(screen.getByLabelText(/invite token/i)).toHaveValue('token-from-qr')
    await userEvent.type(screen.getByLabelText(/your name/i), 'Alice')
    await userEvent.click(screen.getByRole('button', { name: /join scan/i }))

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    const body = JSON.parse(fetch.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ shortCode: 'JOIN-7K9', joinToken: 'token-from-qr', displayName: 'Alice' })
    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({
        scan: expect.objectContaining({ id: 'scan-joined' }),
        session: expect.objectContaining({ id: 'sess-join', status: 'active' }),
      })
    )
  })

  it('shows required join error messages for expired links and missing scans', async () => {
    const fetch = makeFetch(401, { error: 'expired' })
    mountScanManagementView(container, { fetch, openDb: async () => db, onReady: vi.fn() })

    await userEvent.type(screen.getByLabelText(/short code/i), 'JOIN-7K9')
    await userEvent.type(screen.getByLabelText(/invite token/i), 'bad-token')
    await userEvent.type(screen.getByLabelText(/your name/i), 'Alice')
    await userEvent.click(screen.getByRole('button', { name: /join scan/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((alert) => /link has expired, ask for a new qr code/i.test(alert.textContent ?? ''))).toBe(true)

    fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'missing' }) })
    await userEvent.click(screen.getByRole('button', { name: /join scan/i }))

    await vi.waitFor(() => {
      expect(within(container).getByText(/scan not found/i)).toBeInTheDocument()
    })
  })
})
