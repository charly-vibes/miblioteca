import { mountAppHeader } from './pwa/AppHeader'
import { mountScanManagementView } from './scan/ScanManagementView'
import { CaptureView } from './tracer/CaptureView'
import { createMockScanFetch } from './tracer/mockScanApi'
import { getAllSessions, getScan, openShelfwalkDb, type ShelfwalkDatabase } from './tracer/persistence'
import type { BootstrapResult } from './tracer/bootstrap'

export type MibliotecaAppDeps = {
  openDb?: () => Promise<ShelfwalkDatabase>
  fetch?: typeof globalThis.fetch
  now?: () => number
}

export function mountMibliotecaApp(root: HTMLElement, deps: MibliotecaAppDeps = {}): () => void {
  const openDb = deps.openDb ?? (() => openShelfwalkDb())
  const fetch = deps.fetch ?? (createMockScanFetch(() => (deps.now ?? Date.now)()) as typeof globalThis.fetch)
  const now = deps.now ?? Date.now
  const disposers: Array<() => void> = []
  let dbPromise: Promise<ShelfwalkDatabase> | null = null
  let captureView: CaptureView | null = null
  let unmountScanManagement: (() => void) | null = null
  let disposed = false

  const getDb = () => {
    dbPromise ??= openDb()
    return dbPromise
  }

  disposers.push(mountAppHeader(root))

  void (async () => {
    const resumed = await loadActiveBootstrap(await getDb())
    if (disposed) return
    if (resumed) {
      captureView = new CaptureView(root, { bootstrapResult: resumed })
      return
    }

    unmountScanManagement = mountScanManagementView(root, {
      openDb: getDb,
      fetch,
      now,
      onReady: (result) => {
        unmountScanManagement?.()
        unmountScanManagement = null
        captureView = new CaptureView(root, { bootstrapResult: result })
      },
    })
  })()

  return () => {
    disposed = true
    unmountScanManagement?.()
    captureView?.destroy()
    for (const dispose of [...disposers].reverse()) dispose()
  }
}

async function loadActiveBootstrap(db: ShelfwalkDatabase): Promise<BootstrapResult | undefined> {
  const activeSession = (await getAllSessions(db))
    .filter((session) => session.status === 'active')
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]
  if (!activeSession) return undefined

  const scan = await getScan(db, activeSession.scanId)
  if (!scan) return undefined

  return { resumed: true, scan, session: activeSession }
}
