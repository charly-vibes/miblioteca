import { FIELD_COUNT, F_T, createTraceBlob } from '../sensors/imuTrace'
import { getSession, getTrace } from './persistence'
import type { ShelfwalkDatabase } from './persistence'

const FIELD_HEADER = 't,ax,ay,az,gx,gy,gz,qx,qy,qz,qw,grx,gry,grz'

export type UploadTraceDeps = {
  db: ShelfwalkDatabase
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'status'>>
}

export type UploadTraceResult =
  | { status: 'uploaded'; httpStatus: number }
  | { status: 'rejected'; httpStatus: number }
  | { status: 'failed'; httpStatus: number }
  | { status: 'failed'; error: unknown }

export async function uploadTrace(sessionId: string, deps: UploadTraceDeps): Promise<UploadTraceResult> {
  const session = await getSession(deps.db, sessionId)
  if (!session) throw new Error(`uploadTrace: session not found: ${sessionId}`)

  const trace = await getTrace(deps.db, sessionId)
  if (!trace) throw new Error(`uploadTrace: trace not found: ${sessionId}`)

  const data = new Float32Array(trace.data)
  if (!Number.isInteger(trace.rowCount) || trace.rowCount < 0 || data.length < trace.rowCount * FIELD_COUNT) {
    throw new Error(`uploadTrace: trace data too short for rowCount: ${sessionId}`)
  }
  const blob = createTraceBlob(data, trace.rowCount)

  try {
    const response = await deps.fetch('/api/upload/trace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Session-Id': sessionId,
        'X-Scan-Id': session.scanId,
        'X-Sample-Rate-Hz': formatSampleRateHz(data, trace.rowCount),
        'X-Fields': FIELD_HEADER,
      },
      body: blob,
    })

    if (response.status >= 200 && response.status < 300) return { status: 'uploaded', httpStatus: response.status }
    if (response.status === 400 || response.status === 413) return { status: 'rejected', httpStatus: response.status }
    return { status: 'failed', httpStatus: response.status }
  } catch (error) {
    return { status: 'failed', error }
  }
}

function formatSampleRateHz(data: Float32Array, rowCount: number): string {
  if (rowCount < 2) return '0'

  const first = data[F_T]
  const last = data[(rowCount - 1) * FIELD_COUNT + F_T]
  const durationSeconds = (last - first) / 1000
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return '0'

  return String(Math.round((rowCount - 1) / durationSeconds))
}
