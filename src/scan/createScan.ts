import { type ShelfwalkDatabase, putScan } from '../tracer/persistence'
import { type TracerBulletScan } from '../tracer/storage'
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
  sessionId: string
  userId: string
  clockOffsetMs: number
}

type CreateScanDeps = {
  fetch: typeof globalThis.fetch
  db: ShelfwalkDatabase
  now?: () => number
}

export async function createScan({ fetch, db, now = Date.now }: CreateScanDeps): Promise<CreateScanResult> {
  const clientTimeMs = now()

  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientTimeMs }),
  })

  if (!response.ok) {
    const code = statusToCode(response.status)
    throw new ScanApiError(code, response.status, `POST /api/scan failed with ${response.status}`)
  }

  const data: ScanApiResponse = await response.json()

  const scan: TracerBulletScan = {
    id: data.scanId,
    shortCode: data.shortCode,
    joinToken: data.joinToken,
    createdAt: new Date().toISOString(),
  }

  await putScan(db, scan)

  return {
    scan,
    sessionId: data.sessionId,
    userId: data.userId,
    clockOffsetMs: clockOffsetMs(data.serverTimeMs, now),
  }
}

function statusToCode(status: number): ScanErrorCode {
  if (status === 400) return 'bad-request'
  if (status === 409) return 'conflict'
  return 'server-error'
}
