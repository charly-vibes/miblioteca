import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openShelfwalkDb } from '../tracer/persistence'
import { createScan } from './createScan'

function makeFetch(status: number, body: object) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

const GOOD_RESPONSE = {
  scanId: 'scan-abc',
  shortCode: 'ABCD-234',
  joinToken: 'deadbeef'.repeat(8),
  serverTimeMs: Date.now() - 300,
}

describe('createScan', () => {
  let dbName: string

  beforeEach(() => {
    dbName = `test-${Date.now()}-${Math.random()}`
  })

  it('POSTs to /api/scan with clientTimeMs', async () => {
    const fetch = makeFetch(200, { sessionId: 'sid', userId: 'uid', ...GOOD_RESPONSE })
    const db = await openShelfwalkDb(dbName)
    const now = () => 1_000_000

    await createScan({ fetch, db, now })

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/scan')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({ clientTimeMs: 1_000_000 })
    db.close()
  })

  it('stores the scan in IDB and returns result', async () => {
    const serverTimeMs = Date.now() - 400
    const fetch = makeFetch(200, {
      sessionId: 'sid-1',
      userId: 'uid-1',
      ...GOOD_RESPONSE,
      serverTimeMs,
    })
    const db = await openShelfwalkDb(dbName)
    const now = () => serverTimeMs + 400

    const result = await createScan({ fetch, db, now })

    expect(result.scan.id).toBe('scan-abc')
    expect(result.scan.shortCode).toBe('ABCD-234')
    expect(result.scan.joinToken).toBe('deadbeef'.repeat(8))
    expect(result.clockOffsetMs).toBe(400)

    const stored = await db.get('scans', 'scan-abc')
    expect(stored).toBeDefined()
    expect(stored?.id).toBe('scan-abc')
    db.close()
  })

  it('throws ScanApiError with code "bad-request" on 400', async () => {
    const fetch = makeFetch(400, { error: 'invalid payload' })
    const db = await openShelfwalkDb(dbName)

    await expect(createScan({ fetch, db, now: Date.now })).rejects.toMatchObject({
      code: 'bad-request',
    })
    db.close()
  })

  it('throws ScanApiError with code "conflict" on 409', async () => {
    const fetch = makeFetch(409, { error: 'scan already exists' })
    const db = await openShelfwalkDb(dbName)

    await expect(createScan({ fetch, db, now: Date.now })).rejects.toMatchObject({
      code: 'conflict',
    })
    db.close()
  })

  it('throws ScanApiError with code "server-error" on 500', async () => {
    const fetch = makeFetch(500, { error: 'internal server error' })
    const db = await openShelfwalkDb(dbName)

    await expect(createScan({ fetch, db, now: Date.now })).rejects.toMatchObject({
      code: 'server-error',
    })
    db.close()
  })

  it('throws ScanApiError with code "server-error" for unexpected status', async () => {
    const fetch = makeFetch(503, {})
    const db = await openShelfwalkDb(dbName)

    await expect(createScan({ fetch, db, now: Date.now })).rejects.toMatchObject({
      code: 'server-error',
    })
    db.close()
  })
})
