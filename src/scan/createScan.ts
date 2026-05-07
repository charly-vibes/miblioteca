import { type ShelfwalkDatabase, putScan, putSession } from '../tracer/persistence'
import { type TracerBulletScan, type TracerBulletSession } from '../tracer/storage'
import { clockOffsetMs } from './codes'

export type ScanErrorCode = 'bad-request' | 'conflict' | 'server-error'

export class ScanApiError extends Error {
  constructor(
    public readonly code: ScanErrorCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message)
    this.name = 'ScanApiError'
  }
}

type ScanApiResponse = {
  scanId: string
  sessionId: string
  userId: string
  shortCode: string
  joinToken: string
  serverTimeMs: number
}

export type CreateScanResult = {
  scan: TracerBulletScan
  session: TracerBulletSession
  sessionId: string
  userId: string
  clockOffsetMs: number
}

type CreateScanDeps = {
  fetch: typeof globalThis.fetch
  db: ShelfwalkDatabase
  now?: () => number
  scanName?: string
}

export async function createScan({ fetch, db, now = Date.now, scanName }: CreateScanDeps): Promise<CreateScanResult> {
  const clientTimeMs = now()
  const body = scanName ? { clientTimeMs, name: scanName } : { clientTimeMs }

  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const code = statusToCode(response.status)
    throw new ScanApiError(code, response.status, `POST /api/scan failed with ${response.status}`)
  }

  const data: ScanApiResponse = await response.json()

  const createdAt = new Date(clientTimeMs).toISOString()
  const offset = clockOffsetMs(data.serverTimeMs, now)
  const scan: TracerBulletScan = {
    id: data.scanId,
    shortCode: data.shortCode,
    joinToken: data.joinToken,
    createdAt,
  }
  const session: TracerBulletSession = {
    id: data.sessionId,
    scanId: data.scanId,
    userId: data.userId,
    startedAt: createdAt,
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

function statusToCode(status: number): ScanErrorCode {
  if (status === 400) return 'bad-request'
  if (status === 409) return 'conflict'
  return 'server-error'
}
