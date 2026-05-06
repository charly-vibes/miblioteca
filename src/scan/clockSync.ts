import { getSession, putSession } from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import type { TracerBulletSession } from '../tracer/storage'
import { clockOffsetMs } from './codes'

const DEFAULT_RESYNC_INTERVAL_MS = 30 * 60 * 1000
const DEFAULT_DRIFT_THRESHOLD_MS = 500
const DEFAULT_DRIFT_CHECK_INTERVAL_MS = 5 * 1000

export class ClockSyncError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClockSyncError'
  }
}

export type ClockSyncDeps = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>
  db: ShelfwalkDatabase
  scanId: string
  sessionId: string
  now?: () => number
  onUpdate?: (session: TracerBulletSession) => void
}

export type ClockSyncResult = {
  clockOffsetMs: number
  session: TracerBulletSession
}

export async function syncScanClock({
  fetch,
  db,
  scanId,
  sessionId,
  now = Date.now,
  onUpdate,
}: ClockSyncDeps): Promise<ClockSyncResult> {
  const response = await fetch(`/api/scan/${encodeURIComponent(scanId)}/time`, { method: 'GET' })
  if (!response.ok) {
    throw new ClockSyncError(`GET /api/scan/${scanId}/time failed with ${response.status}`)
  }

  const data = await response.json() as { serverTimeMs?: unknown }
  if (typeof data.serverTimeMs !== 'number') {
    throw new ClockSyncError('Invalid scan time response: serverTimeMs is not a number')
  }

  const session = await getSession(db, sessionId)
  if (!session) {
    throw new ClockSyncError(`Session not found: ${sessionId}`)
  }

  const offset = clockOffsetMs(data.serverTimeMs, now)
  const updated = { ...session, clockOffsetMs: offset }
  await putSession(db, updated)
  onUpdate?.(updated)

  return { clockOffsetMs: offset, session: updated }
}

export type ClockSyncControllerDeps = ClockSyncDeps & {
  monotonic?: () => number
  setInterval?: (handler: () => void, timeout: number) => number
  clearInterval?: (id: number) => void
  resyncIntervalMs?: number
  driftThresholdMs?: number
  driftCheckIntervalMs?: number
}

export type ClockSyncController = {
  syncNow(): Promise<ClockSyncResult | undefined>
  checkDrift(): Promise<ClockSyncResult | undefined>
  stop(): void
}

export function startClockSync({
  monotonic = () => performance.now(),
  setInterval: schedule = (handler, timeout) => globalThis.setInterval(handler, timeout) as unknown as number,
  clearInterval: cancel = (id) => globalThis.clearInterval(id),
  resyncIntervalMs = DEFAULT_RESYNC_INTERVAL_MS,
  driftThresholdMs = DEFAULT_DRIFT_THRESHOLD_MS,
  driftCheckIntervalMs = DEFAULT_DRIFT_CHECK_INTERVAL_MS,
  ...deps
}: ClockSyncControllerDeps): ClockSyncController {
  let baselineWallMinusMono = (deps.now ?? Date.now)() - monotonic()
  let inFlight: Promise<ClockSyncResult> | null = null

  const syncNow = async (): Promise<ClockSyncResult | undefined> => {
    if (inFlight) return undefined
    inFlight = syncScanClock(deps)
    try {
      const result = await inFlight
      baselineWallMinusMono = (deps.now ?? Date.now)() - monotonic()
      return result
    } finally {
      inFlight = null
    }
  }

  const checkDrift = async (): Promise<ClockSyncResult | undefined> => {
    const wallMinusMono = (deps.now ?? Date.now)() - monotonic()
    if (Math.abs(wallMinusMono - baselineWallMinusMono) <= driftThresholdMs) {
      return undefined
    }
    return syncNow()
  }

  const resyncTimerId = schedule(() => {
    void syncNow()
  }, resyncIntervalMs)
  const driftTimerId = schedule(() => {
    void checkDrift()
  }, driftCheckIntervalMs)

  return {
    syncNow,
    checkDrift,
    stop() {
      cancel(resyncTimerId)
      cancel(driftTimerId)
    },
  }
}
