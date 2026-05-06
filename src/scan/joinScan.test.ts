import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { openShelfwalkDb } from '../tracer/persistence'
import { joinScan, JoinScanError } from './joinScan'

function makeFetch(status: number, body: object) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

const GOOD_RESPONSE = {
  scanId: 'scan-xyz',
  sessionId: 'sess-abc',
  userId: 'user-42',
  shortCode: 'WXYZ-789',
  serverTimeMs: Date.now() - 250,
}

const JOIN_INPUT = {
  shortCode: 'WXYZ-789',
  joinToken: 'cafebabe'.repeat(8),
  displayName: 'Alice',
}

describe('joinScan', () => {
  let dbName: string

  beforeEach(() => {
    dbName = `test-${Date.now()}-${Math.random()}`
  })

  it('POSTs to /api/scan/join with shortCode, joinToken, displayName, clientTimeMs', async () => {
    const fetch = makeFetch(200, GOOD_RESPONSE)
    const db = await openShelfwalkDb(dbName)
    const now = () => 2_000_000

    await joinScan({ fetch, db, now, ...JOIN_INPUT })

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/scan/join')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({
      shortCode: 'WXYZ-789',
      joinToken: 'cafebabe'.repeat(8),
      displayName: 'Alice',
      clientTimeMs: 2_000_000,
    })
    db.close()
  })

  it('stores scan and session in IDB and returns result', async () => {
    const serverTimeMs = Date.now() - 300
    const fetch = makeFetch(200, { ...GOOD_RESPONSE, serverTimeMs })
    const db = await openShelfwalkDb(dbName)
    const now = () => serverTimeMs + 300

    const result = await joinScan({ fetch, db, now, ...JOIN_INPUT })

    expect(result.scan.id).toBe('scan-xyz')
    expect(result.scan.shortCode).toBe('WXYZ-789')
    expect(result.sessionId).toBe('sess-abc')
    expect(result.userId).toBe('user-42')
    expect(result.clockOffsetMs).toBe(300)

    const storedScan = await db.get('scans', 'scan-xyz')
    expect(storedScan).toBeDefined()
    expect(storedScan?.id).toBe('scan-xyz')

    const storedSession = await db.get('sessions', 'sess-abc')
    expect(storedSession).toBeDefined()
    expect(storedSession?.id).toBe('sess-abc')
    expect(storedSession?.scanId).toBe('scan-xyz')
    expect(storedSession?.userId).toBe('user-42')
    expect(storedSession?.clockOffsetMs).toBe(300)
    db.close()
  })

  it('throws JoinScanError with code "invalid-token" on 401', async () => {
    const fetch = makeFetch(401, { error: 'token expired' })
    const db = await openShelfwalkDb(dbName)

    await expect(joinScan({ fetch, db, now: Date.now, ...JOIN_INPUT })).rejects.toMatchObject({
      code: 'invalid-token',
    })
    db.close()
  })

  it('throws JoinScanError with code "not-found" on 404', async () => {
    const fetch = makeFetch(404, { error: 'scan not found' })
    const db = await openShelfwalkDb(dbName)

    await expect(joinScan({ fetch, db, now: Date.now, ...JOIN_INPUT })).rejects.toMatchObject({
      code: 'not-found',
    })
    db.close()
  })

  it('throws JoinScanError with code "server-error" on 500', async () => {
    const fetch = makeFetch(500, { error: 'internal error' })
    const db = await openShelfwalkDb(dbName)

    await expect(joinScan({ fetch, db, now: Date.now, ...JOIN_INPUT })).rejects.toMatchObject({
      code: 'server-error',
    })
    db.close()
  })

  it('throws JoinScanError with code "server-error" for unexpected status', async () => {
    const fetch = makeFetch(503, {})
    const db = await openShelfwalkDb(dbName)

    await expect(joinScan({ fetch, db, now: Date.now, ...JOIN_INPUT })).rejects.toMatchObject({
      code: 'server-error',
    })
    db.close()
  })
})
