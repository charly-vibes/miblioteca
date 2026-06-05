import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  openShelfwalkDb,
  putRecord,
  putScan,
  putSession,
  putSessionBundleDeliveryState,
  type CaptureRecord,
  type ShelfwalkDatabase,
} from '../tracer'
import { mountSessionsListView } from './SessionsListView'

function makeRecord(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    recordId: 'rec-1',
    sessionId: 'sess-1',
    scanId: 'scan-1',
    userId: 'user-1',
    index: 0,
    capturedAt: '2026-05-07T10:00:00.000Z',
    capturedAtMonotonic: 1000,
    zupt: true,
    image: {
      blobRef: 'blob-1',
      thumbnailBlobRef: 'thumb-1',
      mimeType: 'image/jpeg',
      width: 640,
      height: 480,
      thumbnailWidth: 640,
      thumbnailHeight: 480,
      sizeBytes: 100_000,
      thumbnailSizeBytes: 10_000,
      sourceApi: 'ImageCapture',
    },
    camera: {},
    qualityChecks: { laplacianVariance: 0, overexposedFraction: 0, underexposedFraction: 0, steadyAtCapture: true, tiltDegrees: 0, blurry: false, overexposed: false, underexposed: false, dark: false },
    uploadState: 'pending' as const,
    uploadAttempts: 0,
    ...overrides,
  }
}

describe('mountSessionsListView', () => {
  let container: HTMLDivElement
  let db: ShelfwalkDatabase

  beforeEach(async () => {
    window.location.hash = '/'
    container = document.createElement('div')
    document.body.append(container)
    db = await openShelfwalkDb(`sessions-list-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  })

  afterEach(() => {
    container.remove()
    db.close()
    window.location.hash = ''
  })

  it('shows quick-start actions before Previous scans on home', async () => {
    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions: vi.fn(),
    })

    expect(screen.getByRole('button', { name: 'Start scanning' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument()

    const startButton = screen.getByRole('button', { name: 'Start scanning' })
    const previousScansHeading = screen.getByRole('heading', { name: 'Previous scans' })
    expect(startButton.compareDocumentPosition(previousScansHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(await screen.findByText(/no sessions yet/i)).toBeInTheDocument()
  })

  it('calls onMoreOptions when More options button is clicked', async () => {
    const onMoreOptions = vi.fn()
    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions,
    })

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))

    expect(onMoreOptions).toHaveBeenCalledOnce()
  })

  it('calls onStartScan when Start scanning button is clicked', async () => {
    const onStartScan = vi.fn()
    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan,
      onMoreOptions: vi.fn(),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Start scanning' }))

    expect(onStartScan).toHaveBeenCalledOnce()
  })

  it('lists sessions sorted newest first', async () => {
    await putScan(db, { id: 'scan-a', shortCode: 'A', joinToken: 'ta', createdAt: '2026-05-01T10:00:00.000Z' })
    await putSession(db, {
      id: 'sess-a', scanId: 'scan-a', userId: 'u', startedAt: '2026-05-01T10:00:00.000Z',
      clockOffsetMs: 0, status: 'active',
    })
    await putSession(db, {
      id: 'sess-b', scanId: 'scan-a', userId: 'u', startedAt: '2026-05-07T12:00:00.000Z',
      clockOffsetMs: 0, status: 'completed',
    })

    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions: vi.fn(),
    })

    await screen.findByText(/may 7/i)
    const rows = container.querySelectorAll('.session-row')
    expect(rows).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Previous scans' })).toBeInTheDocument()
    // newest first — May 7 before May 1
    expect(rows[0].textContent).toMatch(/may 7/i)
    expect(rows[1].textContent).toMatch(/may 1/i)
  })

  it('shows capture count per session', async () => {
    await putScan(db, { id: 'scan-1', shortCode: 'S1', joinToken: 'tj', createdAt: '2026-05-07T10:00:00.000Z' })
    await putSession(db, {
      id: 'sess-1', scanId: 'scan-1', userId: 'u', startedAt: '2026-05-07T10:00:00.000Z',
      clockOffsetMs: 0, status: 'active',
    })
    await putRecord(db, makeRecord({ recordId: 'rec-1', sessionId: 'sess-1', index: 0 }))
    await putRecord(db, makeRecord({ recordId: 'rec-2', sessionId: 'sess-1', index: 1 }))

    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions: vi.fn(),
    })

    expect(await screen.findByText(/2 captures/i)).toBeInTheDocument()
  })

  it('shows singular "1 capture" correctly', async () => {
    await putScan(db, { id: 'scan-1', shortCode: 'S1', joinToken: 'tj', createdAt: '2026-05-07T10:00:00.000Z' })
    await putSession(db, {
      id: 'sess-1', scanId: 'scan-1', userId: 'u', startedAt: '2026-05-07T10:00:00.000Z',
      clockOffsetMs: 0, status: 'active',
    })
    await putRecord(db, makeRecord({ recordId: 'rec-1', sessionId: 'sess-1', index: 0 }))

    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions: vi.fn(),
    })

    expect(await screen.findByText(/1 capture$/i)).toBeInTheDocument()
  })

  it('shows Pending export status when not exported', async () => {
    await putScan(db, { id: 'scan-1', shortCode: 'S1', joinToken: 'tj', createdAt: '2026-05-07T10:00:00.000Z' })
    await putSession(db, {
      id: 'sess-1', scanId: 'scan-1', userId: 'u', startedAt: '2026-05-07T10:00:00.000Z',
      clockOffsetMs: 0, status: 'active',
    })

    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions: vi.fn(),
    })

    expect(await screen.findByText('Pending')).toBeInTheDocument()
  })

  it('shows Exported export status when bundle was exported', async () => {
    await putScan(db, { id: 'scan-1', shortCode: 'S1', joinToken: 'tj', createdAt: '2026-05-07T10:00:00.000Z' })
    await putSession(db, {
      id: 'sess-1', scanId: 'scan-1', userId: 'u', startedAt: '2026-05-07T10:00:00.000Z',
      clockOffsetMs: 0, status: 'active',
    })
    await putSessionBundleDeliveryState(db, 'sess-1', {
      status: 'exported',
      bundleFilename: 'bundle.zip',
      exportedAt: '2026-05-07T11:00:00.000Z',
      sizeBytes: 50_000,
      sha256: 'abc',
    })

    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions: vi.fn(),
    })

    expect(await screen.findByText('Exported')).toBeInTheDocument()
  })

  it('navigates to session hash when a row is clicked', async () => {
    await putScan(db, { id: 'scan-1', shortCode: 'S1', joinToken: 'tj', createdAt: '2026-05-07T10:00:00.000Z' })
    await putSession(db, {
      id: 'sess-1', scanId: 'scan-1', userId: 'u', startedAt: '2026-05-07T10:00:00.000Z',
      clockOffsetMs: 0, status: 'active',
    })

    mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions: vi.fn(),
    })

    await screen.findByText(/pending/i)
    const row = container.querySelector('.session-row')!
    await userEvent.click(row)

    expect(window.location.hash).toBe('#/session/sess-1')
  })

  it('removes from DOM on unmount', () => {
    const unmount = mountSessionsListView(container, {
      openDb: async () => db,
      onStartScan: vi.fn(),
      onMoreOptions: vi.fn(),
    })
    unmount()
    expect(container.querySelector('.sessions-list')).toBeNull()
  })
})
