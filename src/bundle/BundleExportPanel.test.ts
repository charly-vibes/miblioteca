import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BundleExportPanel } from './BundleExportPanel'
import type { BundleExportPanelOptions } from './BundleExportPanel'

vi.mock('./share', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./share')>()
  return { ...actual, shareBundle: vi.fn(), downloadBundle: vi.fn() }
})
import { shareBundle, downloadBundle } from './share'
import {
  openShelfwalkDb,
  saveCapture,
  putScan,
  putSession,
  putSessionBundleDeliveryState,
} from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import type { CaptureRecord } from '../tracer/capture'
import type { TracerBulletScan, TracerBulletSession } from '../tracer/storage'
import type { BundleAssemblyResult } from './assemble'
import type { BundleManifest } from './types'

let db: ShelfwalkDatabase
let container: HTMLDivElement

const SCAN_ID = 'scan-1'
const SESSION_ID = 'session-1'

function makeScan(partial: Partial<TracerBulletScan> = {}): TracerBulletScan {
  return { id: SCAN_ID, shortCode: 'ABC', joinToken: 'tok', createdAt: '2026-05-07T00:00:00Z', ...partial }
}

function makeSession(partial: Partial<TracerBulletSession> = {}): TracerBulletSession {
  return { id: SESSION_ID, scanId: SCAN_ID, userId: 'u1', startedAt: '2026-05-07T00:00:00Z', clockOffsetMs: 0, status: 'completed', ...partial }
}

function makeRecord(partial: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    recordId: 'rec-1', sessionId: SESSION_ID, scanId: SCAN_ID, userId: 'u1', index: 0,
    capturedAt: '2026-05-07T00:00:00Z', capturedAtMonotonic: 0, zupt: true,
    uploadState: 'pending',
    uploadAttempts: 0,
    camera: {},
    qualityChecks: { laplacianVariance: 0, overexposedFraction: 0, underexposedFraction: 0, steadyAtCapture: true, tiltDegrees: 0, blurry: false, overexposed: false, underexposed: false, dark: false },
    image: { blobRef: 'rec-1', thumbnailBlobRef: 'rec-1', mimeType: 'image/jpeg', width: 100, height: 100, thumbnailWidth: 10, thumbnailHeight: 10, sizeBytes: 4, thumbnailSizeBytes: 4, sourceApi: 'CanvasSnapshot' },
    ...partial,
  }
}

function makeManifest(): BundleManifest {
  return { formatVersion: 1, appVersion: '0.0.0', scanId: SCAN_ID, sessionIds: [SESSION_ID], exportedAt: '2026-05-07T00:00:00Z', recordCount: 1, sessionCount: 1, totalBytes: 4, files: [] }
}

function makeBlob(): Blob {
  return new Blob(['zip'], { type: 'application/zip' })
}

function makePanel(overrides: Partial<BundleExportPanelOptions> = {}): BundleExportPanel {
  return new BundleExportPanel(container, {
    db,
    scanId: SCAN_ID,
    appVersion: '0.0.0',
    shareCapability: { status: 'unsupported', reason: 'web-share-unavailable', fallback: 'download' },
    assemble: vi.fn().mockResolvedValue({ ok: false, error: 'not set up' } satisfies BundleAssemblyResult),
    ...overrides,
  })
}

beforeEach(async () => {
  db = await openShelfwalkDb(`test-${crypto.randomUUID()}`)
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

describe('BundleExportPanel — idle state', () => {
  it('renders an Export bundle button when no prior delivery state exists', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    makePanel()
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /export bundle/i })).toBeInTheDocument()
    })
  })

  it('shows idle status label', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    makePanel()
    await vi.waitFor(() => {
      expect(screen.getByText(/on-device/i)).toBeInTheDocument()
    })
  })
})

describe('BundleExportPanel — restoring persisted delivery state', () => {
  it('shows previously-exported status and re-export button when session was exported in a prior session', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await putSessionBundleDeliveryState(db, SESSION_ID, {
      status: 'exported',
      bundleFilename: 'lib.mbibundle.zip',
      exportedAt: '2026-05-07T00:00:00Z',
      sizeBytes: 1024,
      sha256: 'abc',
    })
    makePanel()
    await vi.waitFor(() => {
      expect(screen.getByText(/previously exported/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull()
  })

  it('shows failed state with retry when session has failed delivery state', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await putSessionBundleDeliveryState(db, SESSION_ID, { status: 'failed', error: 'disk full' })
    makePanel()
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      expect(screen.getByText(/disk full/i)).toBeInTheDocument()
    })
  })

  it('shows aborted state with retry when session has aborted delivery state', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await putSessionBundleDeliveryState(db, SESSION_ID, { status: 'aborted' })
    makePanel()
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
  })
})

describe('BundleExportPanel — exporting flow', () => {
  it('shows exporting status and cancel button while assembling', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await saveCapture(db, { record: makeRecord(), imageBlob: new Blob(['img']), thumbnailBlob: new Blob(['th']) })

    let resolveAssemble!: (r: BundleAssemblyResult) => void
    const assemble = vi.fn().mockReturnValue(new Promise<BundleAssemblyResult>((r) => { resolveAssemble = r }))

    makePanel({ assemble })

    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    expect(screen.getByText(/exporting/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()

    resolveAssemble({ ok: true, blob: makeBlob(), manifest: makeManifest(), filename: 'lib.mbibundle.zip' })
  })

  it('shows download button and guidance after successful export', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await saveCapture(db, { record: makeRecord(), imageBlob: new Blob(['img']), thumbnailBlob: new Blob(['th']) })

    const assemble = vi.fn().mockResolvedValue({
      ok: true,
      blob: makeBlob(),
      manifest: makeManifest(),
      filename: 'lib.mbibundle.zip',
    } satisfies BundleAssemblyResult)

    makePanel({ assemble })
    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
      expect(screen.getByText(/exported/i)).toBeInTheDocument()
    })
  })

  it('shows share button when web share is supported', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await saveCapture(db, { record: makeRecord(), imageBlob: new Blob(['img']), thumbnailBlob: new Blob(['th']) })

    const assemble = vi.fn().mockResolvedValue({
      ok: true, blob: makeBlob(), manifest: makeManifest(), filename: 'lib.mbibundle.zip',
    } satisfies BundleAssemblyResult)

    makePanel({
      assemble,
      shareCapability: { status: 'supported' },
    })

    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
    })
  })

  it('falls back to download when share throws NotAllowedError', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await saveCapture(db, { record: makeRecord(), imageBlob: new Blob(['img']), thumbnailBlob: new Blob(['th']) })

    const assemble = vi.fn().mockResolvedValue({
      ok: true, blob: makeBlob(), manifest: makeManifest(), filename: 'lib.mbibundle.zip',
    } satisfies BundleAssemblyResult)

    vi.mocked(shareBundle).mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))

    makePanel({ assemble, shareCapability: { status: 'supported' } })
    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    await vi.waitFor(() => screen.getByRole('button', { name: /share/i }))
    await userEvent.click(screen.getByRole('button', { name: /share/i }))

    await vi.waitFor(() => {
      expect(vi.mocked(downloadBundle)).toHaveBeenCalled()
    })
  })

  it('shows error and retry after failed assembly', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())

    const assemble = vi.fn().mockResolvedValue({ ok: false, error: 'blob missing' } satisfies BundleAssemblyResult)

    makePanel({ assemble })
    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      expect(screen.getByText(/blob missing/i)).toBeInTheDocument()
    })
  })

  it('shows aborted state after cancel', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())

    let resolveAssemble!: (r: BundleAssemblyResult) => void
    const assemble = vi.fn().mockReturnValue(new Promise<BundleAssemblyResult>((r) => { resolveAssemble = r }))

    makePanel({ assemble })
    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    resolveAssemble({ ok: false, error: 'aborted' })

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
  })
})

describe('BundleExportPanel — size warnings', () => {
  it('shows drive-or-usb recommendation for bundles >= 500 MB', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())

    const bigBlob = new Blob(['x'.repeat(10)], { type: 'application/zip' })
    const manifest = { ...makeManifest(), totalBytes: 500 * 1024 * 1024 }
    const assemble = vi.fn().mockResolvedValue({
      ok: true, blob: bigBlob, manifest, filename: 'lib.mbibundle.zip',
    } satisfies BundleAssemblyResult)

    makePanel({ assemble })
    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/drive.*usb|usb.*drive/i)).toBeInTheDocument()
    })
  })

  it('shows warning for bundles >= 100 MB and < 500 MB', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())

    const manifest = { ...makeManifest(), totalBytes: 200 * 1024 * 1024 }
    const assemble = vi.fn().mockResolvedValue({
      ok: true, blob: makeBlob(), manifest, filename: 'lib.mbibundle.zip',
    } satisfies BundleAssemblyResult)

    makePanel({ assemble })
    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/100 mb|email may fail/i)).toBeInTheDocument()
    })
  })

  it('shows recompress warning after any successful export', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())

    const assemble = vi.fn().mockResolvedValue({
      ok: true, blob: makeBlob(), manifest: makeManifest(), filename: 'lib.mbibundle.zip',
    } satisfies BundleAssemblyResult)

    makePanel({ assemble })
    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    await userEvent.click(screen.getByRole('button', { name: /export bundle/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/send as a file or document/i)).toBeInTheDocument()
    })
  })
})

describe('BundleExportPanel — destroy', () => {
  it('removes the panel element from the DOM', async () => {
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    const panel = makePanel()
    await vi.waitFor(() => screen.getByRole('button', { name: /export bundle/i }))
    panel.destroy()
    expect(container.querySelector('.bundle-export-panel')).toBeNull()
  })
})
