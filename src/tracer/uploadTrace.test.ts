import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openShelfwalkDb, putSession, putTrace } from './persistence'
import type { ShelfwalkDatabase } from './persistence'
import { endSession, startSession } from './session'
import { uploadTrace } from './uploadTrace'
import type { UploadTraceDeps } from './uploadTrace'
import type { TracerBulletSession } from './storage'
import { FIELD_COUNT, F_T } from '../sensors/imuTrace'

const BASE_SESSION: TracerBulletSession = {
  id: 'sess-trace',
  scanId: 'scan-trace',
  userId: 'user-1',
  startedAt: '2026-05-06T10:00:00.000Z',
  clockOffsetMs: 0,
  status: 'active',
}

let db: ShelfwalkDatabase

beforeEach(async () => {
  const name = `shelfwalk-upload-trace-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(name)
})

function traceData(times: number[]): ArrayBuffer {
  const data = new Float32Array(times.length * FIELD_COUNT)
  times.forEach((t, row) => {
    data[row * FIELD_COUNT + F_T] = t
  })
  return data.buffer
}

function mockTraceFetch(status: number): UploadTraceDeps['fetch'] {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status }))
}

describe('uploadTrace', () => {
  it('POSTs the session trace Blob as application/octet-stream with required headers', async () => {
    await putSession(db, { ...BASE_SESSION, status: 'completed', endedAt: '2026-05-06T10:01:00.000Z' })
    await putTrace(db, 'sess-trace', {
      sessionId: 'sess-trace',
      rowCount: 4,
      data: traceData([0, 20, 40, 60]),
      pauseGaps: [],
    })
    const fetch = mockTraceFetch(200)

    const result = await uploadTrace('sess-trace', { db, fetch })

    expect(result).toEqual({ status: 'uploaded', httpStatus: 200 })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/upload/trace')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      'Content-Type': 'application/octet-stream',
      'X-Session-Id': 'sess-trace',
      'X-Scan-Id': 'scan-trace',
      'X-Sample-Rate-Hz': '50',
      'X-Fields': 't,ax,ay,az,gx,gy,gz,qx,qy,qz,qw,grx,gry,grz',
    })
    const body = init?.body as Blob
    expect(body.type).toBe('application/octet-stream')
    expect(body.size).toBe(4 * FIELD_COUNT * 4)
  })

  it.each([400, 413] as const)('returns rejected for terminal status %i', async (status) => {
    await putSession(db, { ...BASE_SESSION, status: 'completed' })
    await putTrace(db, 'sess-trace', { sessionId: 'sess-trace', rowCount: 1, data: traceData([0]), pauseGaps: [] })

    await expect(uploadTrace('sess-trace', { db, fetch: async () => new Response(null, { status }) })).resolves.toEqual({
      status: 'rejected',
      httpStatus: status,
    })
  })

  it('returns failed for retryable 500 responses', async () => {
    await putSession(db, { ...BASE_SESSION, status: 'completed' })
    await putTrace(db, 'sess-trace', { sessionId: 'sess-trace', rowCount: 1, data: traceData([0]), pauseGaps: [] })

    await expect(uploadTrace('sess-trace', { db, fetch: async () => new Response(null, { status: 500 }) })).resolves.toEqual({
      status: 'failed',
      httpStatus: 500,
    })
  })

  it('returns failed for network errors', async () => {
    await putSession(db, { ...BASE_SESSION, status: 'completed' })
    await putTrace(db, 'sess-trace', { sessionId: 'sess-trace', rowCount: 1, data: traceData([0]), pauseGaps: [] })
    const error = new TypeError('offline')

    await expect(uploadTrace('sess-trace', { db, fetch: async () => { throw error } })).resolves.toEqual({
      status: 'failed',
      error,
    })
  })

  it('throws when the session or trace is missing', async () => {
    await expect(uploadTrace('missing', { db, fetch: async () => new Response(null, { status: 200 }) })).rejects.toThrow(
      'uploadTrace: session not found: missing'
    )

    await putSession(db, BASE_SESSION)
    await expect(uploadTrace('sess-trace', { db, fetch: async () => new Response(null, { status: 200 }) })).rejects.toThrow(
      'uploadTrace: trace not found: sess-trace'
    )
  })

  it('throws before uploading when trace data is shorter than rowCount declares', async () => {
    await putSession(db, BASE_SESSION)
    await putTrace(db, 'sess-trace', { sessionId: 'sess-trace', rowCount: 2, data: traceData([0]), pauseGaps: [] })
    const fetch = mockTraceFetch(200)

    await expect(uploadTrace('sess-trace', { db, fetch })).rejects.toThrow(
      'uploadTrace: trace data too short for rowCount: sess-trace'
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('endSession trace upload trigger', () => {
  it('uploads the trace after marking the session completed', async () => {
    await startSession(db, BASE_SESSION)
    await putTrace(db, 'sess-trace', { sessionId: 'sess-trace', rowCount: 1, data: traceData([0]), pauseGaps: [] })
    const fetch = mockTraceFetch(200)

    await expect(endSession(db, 'sess-trace', '2026-05-06T11:00:00.000Z', { fetch })).resolves.toEqual({
      status: 'uploaded',
      httpStatus: 200,
    })

    expect(fetch).toHaveBeenCalledOnce()
    await expect(db.get('sessions', 'sess-trace')).resolves.toMatchObject({ status: 'completed' })
  })
})
