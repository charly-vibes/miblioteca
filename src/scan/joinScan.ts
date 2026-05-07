import { type ShelfwalkDatabase, putScan, putSession } from '../tracer/persistence'
import { type TracerBulletScan, type TracerBulletSession } from '../tracer/storage'
import { clockOffsetMs } from './codes'

export type JoinScanErrorCode = 'invalid-token' | 'not-found' | 'server-error'

export class JoinScanError extends Error {
  constructor(
    public readonly code: JoinScanErrorCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message)
    this.name = 'JoinScanError'
  }
}

type JoinApiResponse = {
  scanId: string
  sessionId: string
  userId: string
  shortCode: string
  serverTimeMs: number
}

export type JoinScanResult = {
  scan: TracerBulletScan
  session: TracerBulletSession
  sessionId: string
  userId: string
  clockOffsetMs: number
}

type JoinScanDeps = {
  fetch: typeof globalThis.fetch
  db: ShelfwalkDatabase
  shortCode: string
  joinToken: string
  displayName: string
  now?: () => number
}

export async function joinScan({
  fetch,
  db,
  shortCode,
  joinToken,
  displayName,
  now = Date.now,
}: JoinScanDeps): Promise<JoinScanResult> {
  const clientTimeMs = now()

  const response = await fetch('/api/scan/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shortCode, joinToken, displayName, clientTimeMs }),
  })

  if (!response.ok) {
    const code = statusToCode(response.status)
    throw new JoinScanError(code, response.status, `POST /api/scan/join failed with ${response.status}`)
  }

  const data: JoinApiResponse = await response.json()
  const offset = clockOffsetMs(data.serverTimeMs, now)

  const scan: TracerBulletScan = {
    id: data.scanId,
    shortCode: data.shortCode,
    joinToken,
    createdAt: new Date().toISOString(),
  }

  const session: TracerBulletSession = {
    id: data.sessionId,
    scanId: data.scanId,
    userId: data.userId,
    startedAt: new Date().toISOString(),
    clockOffsetMs: offset,
    status: 'active',
  }

  await putScan(db, scan)
  await putSession(db, session)

  return {
    scan,
    session,
    sessionId: data.sessionId,
    userId: data.userId,
    clockOffsetMs: offset,
  }
}

function statusToCode(status: number): JoinScanErrorCode {
  if (status === 401) return 'invalid-token'
  if (status === 404) return 'not-found'
  return 'server-error'
}
