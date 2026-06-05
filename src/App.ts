import { mountAppHeader } from './pwa/AppHeader'
import { mountScanManagementView } from './scan/ScanManagementView'
import { mountSessionsListView } from './scan/SessionsListView'
import {
  CaptureView,
  createMockScanFetch,
  getSession,
  getScan,
  openShelfwalkDb,
  type BootstrapResult,
  type ShelfwalkDatabase,
} from './tracer'
import type { CreateScanResult } from './scan/createScan'
import { createScan } from './scan/createScan'
import { parseRoute, navigateToSession, navigateHome, navigateToNewScan, type Route } from './router'
import { detectSensorDeps } from './sensors/probe'
import type { GyroLike } from './sensors/ghostOverlayCanvas'
import type { AccelerometerLike } from './sensors/imuRecorder'
import { DeviceMotionGyroAdapter, DeviceMotionAccelAdapter } from './sensors/deviceMotionAdapter'

export type MibliotecaAppDeps = {
  openDb?: () => Promise<ShelfwalkDatabase>
  fetch?: typeof globalThis.fetch
  now?: () => number
}

const QUICK_START_ERROR = 'Couldn’t start scan. Check connection/storage and try again.'
const QUICK_START_SESSION_KEY = 'miblioteca.quick-start-session-id'

export function mountMibliotecaApp(root: HTMLElement, deps: MibliotecaAppDeps = {}): () => void {
  const openDb = deps.openDb ?? (() => openShelfwalkDb())
  const fetch = deps.fetch ?? (createMockScanFetch(() => (deps.now ?? Date.now)()) as typeof globalThis.fetch)
  const now = deps.now ?? Date.now
  const disposers: Array<() => void> = []
  let dbPromise: Promise<ShelfwalkDatabase> | null = null
  let captureView: CaptureView | null = null
  let unmountScanManagement: (() => void) | null = null
  let disposed = false
  let generation = 0
  let quickStartPending = false
  let quickStartError = ''
  let quickStartResult: CreateScanResult | null = null
  let autoOpenCameraSessionId: string | null = null

  const getDb = () => {
    dbPromise ??= openDb()
    return dbPromise
  }

  function teardownCurrentView() {
    captureView?.destroy()
    captureView = null
    unmountScanManagement?.()
    unmountScanManagement = null
  }

  function rerenderHomeIfVisible() {
    if (disposed || parseRoute().kind !== 'home') return
    void handleRoute({ kind: 'home' })
  }

  async function resumeExistingQuickStartSession(): Promise<boolean> {
    const resultSessionId = quickStartResult?.session.id
    if (resultSessionId) {
      navigateToSession(resultSessionId)
      return true
    }

    const persistedSessionId = sessionStorage.getItem(QUICK_START_SESSION_KEY)
    if (!persistedSessionId) return false

    const db = await getDb()
    const session = await getSession(db, persistedSessionId)
    if (!session) {
      sessionStorage.removeItem(QUICK_START_SESSION_KEY)
      return false
    }

    navigateToSession(session.id)
    return true
  }

  async function startQuickScan() {
    if (quickStartPending) return
    if (quickStartError && await resumeExistingQuickStartSession()) return

    quickStartPending = true
    quickStartError = ''
    rerenderHomeIfVisible()

    try {
      const result = await createScan({
        fetch,
        db: await getDb(),
        now,
      })
      quickStartPending = false
      quickStartResult = result
      autoOpenCameraSessionId = result.session.id
      sessionStorage.setItem(QUICK_START_SESSION_KEY, result.session.id)
      navigateToSession(result.session.id)
    } catch {
      quickStartPending = false
      quickStartError = QUICK_START_ERROR
      rerenderHomeIfVisible()
    }
  }

  async function handleRoute(route: Route) {
    const gen = ++generation
    if (disposed) return
    teardownCurrentView()

    if (route.kind === 'session') {
      const db = await getDb()
      if (gen !== generation || disposed) return
      const bootstrap = await loadBootstrapForSession(db, route.sessionId)
      if (gen !== generation || disposed) return
      if (!bootstrap) { navigateHome(); return }
      const sensors = detectSensorDeps()
      const gyro = sensors.hasGyroscope
        ? (new Gyroscope({ frequency: 60 }) as unknown as GyroLike)
        : sensors.hasDeviceMotionEvent
          ? new DeviceMotionGyroAdapter(window)
          : null
      const accel = sensors.hasAccelerometer
        ? (new Accelerometer({ frequency: 60 }) as unknown as AccelerometerLike)
        : sensors.hasDeviceMotionEvent
          ? new DeviceMotionAccelAdapter(window)
          : null
      const testQualityFrame = (window as unknown as { __miblioteca_test_quality_frame?: () => ImageData | null }).__miblioteca_test_quality_frame
      const autoRequestCamera = autoOpenCameraSessionId === route.sessionId
      autoOpenCameraSessionId = autoRequestCamera ? null : autoOpenCameraSessionId
      captureView = new CaptureView(root, {
        bootstrapResult: bootstrap,
        onBack: navigateHome,
        gyro,
        accel,
        getQualityFrame: testQualityFrame,
        autoRequestCamera,
      })
    } else if (route.kind === 'new-scan') {
      unmountScanManagement = mountScanManagementView(root, {
        openDb: getDb,
        fetch,
        now,
        onReady: (result) => {
          navigateToSession(result.session.id)
        },
        onBack: navigateHome,
      })
    } else {
      unmountScanManagement = mountSessionsListView(root, {
        openDb: getDb,
        onStartScan: () => {
          void startQuickScan()
        },
        onMoreOptions: navigateToNewScan,
        quickStartPending,
        quickStartError,
      })
    }
  }

  disposers.push(mountAppHeader(root))

  const onHashChange = () => void handleRoute(parseRoute())
  window.addEventListener('hashchange', onHashChange)
  disposers.push(() => window.removeEventListener('hashchange', onHashChange))

  void handleRoute(parseRoute())

  return () => {
    disposed = true
    teardownCurrentView()
    for (const dispose of [...disposers].reverse()) dispose()
  }
}

async function loadBootstrapForSession(
  db: ShelfwalkDatabase,
  sessionId: string
): Promise<BootstrapResult | undefined> {
  const session = await getSession(db, sessionId)
  if (!session) return undefined
  const scan = await getScan(db, session.scanId)
  if (!scan) return undefined
  return { resumed: true, scan, session }
}
