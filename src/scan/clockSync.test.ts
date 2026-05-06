import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSession, openShelfwalkDb, putSession } from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import type { TracerBulletSession } from '../tracer/storage'
import { startClockSync, syncScanClock } from './clockSync'

const SESSION: TracerBulletSession = {
  id: 'sess-clock',
  scanId: 'scan-clock',
  userId: 'user-1',
  startedAt: '2026-05-06T20:00:00.000Z',
  clockOffsetMs: 100,
  status: 'active',
}

let db: ShelfwalkDatabase

beforeEach(async () => {
  vi.useRealTimers()
  const dbName = `shelfwalk-clock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(dbName)
  await putSession(db, SESSION)
})

function makeFetch(serverTimeMs: number) {
  return vi.fn(async () => new Response(JSON.stringify({ serverTimeMs }), { status: 200 }))
}

describe('syncScanClock', () => {
  it('GETs /api/scan/:id/time and persists the new session clockOffsetMs', async () => {
    const fetch = makeFetch(1_000)

    const result = await syncScanClock({
      fetch,
      db,
      scanId: 'scan-clock',
      sessionId: 'sess-clock',
      now: () => 1_450,
    })

    expect(fetch).toHaveBeenCalledWith('/api/scan/scan-clock/time', { method: 'GET' })
    expect(result.clockOffsetMs).toBe(450)
    expect((await getSession(db, 'sess-clock'))?.clockOffsetMs).toBe(450)
  })

  it('updates in-memory session state through onUpdate', async () => {
    const fetch = makeFetch(5_000)
    const updates: TracerBulletSession[] = []

    await syncScanClock({
      fetch,
      db,
      scanId: 'scan-clock',
      sessionId: 'sess-clock',
      now: () => 5_700,
      onUpdate: (session) => updates.push(session),
    })

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ id: 'sess-clock', clockOffsetMs: 700 })
  })
})

describe('startClockSync', () => {
  it('re-syncs every 30 minutes', async () => {
    const fetch = makeFetch(10_000)
    const scheduledHandlers: Array<() => void> = []
    const scheduledTimeouts: number[] = []

    const sync = startClockSync({
      fetch,
      db,
      scanId: 'scan-clock',
      sessionId: 'sess-clock',
      now: () => 10_250,
      monotonic: () => 250,
      setInterval: (handler, timeout) => {
        scheduledHandlers.push(handler)
        scheduledTimeouts.push(timeout)
        return scheduledHandlers.length
      },
      clearInterval: () => undefined,
    })

    expect(scheduledTimeouts).toContain(30 * 60 * 1000)
    expect(fetch).not.toHaveBeenCalled()
    scheduledHandlers[0]()
    await vi.waitFor(async () => {
      expect(fetch).toHaveBeenCalledTimes(1)
      expect((await getSession(db, 'sess-clock'))?.clockOffsetMs).toBe(250)
    })
    sync.stop()
  })

  it('re-syncs when wall-clock minus monotonic-clock drift exceeds 500 ms', async () => {
    const fetch = makeFetch(20_000)
    let wallNow = 20_250
    let monoNow = 250
    const sync = startClockSync({
      fetch,
      db,
      scanId: 'scan-clock',
      sessionId: 'sess-clock',
      now: () => wallNow,
      monotonic: () => monoNow,
    })

    wallNow = 20_751
    await sync.checkDrift()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect((await getSession(db, 'sess-clock'))?.clockOffsetMs).toBe(751)
    sync.stop()
  })

  it('automatically checks for drift every 5 seconds', async () => {
    const fetch = makeFetch(40_000)
    let wallNow = 40_250
    const scheduledHandlers: Array<() => void> = []
    const scheduledTimeouts: number[] = []
    const sync = startClockSync({
      fetch,
      db,
      scanId: 'scan-clock',
      sessionId: 'sess-clock',
      now: () => wallNow,
      monotonic: () => 250,
      setInterval: (handler, timeout) => {
        scheduledHandlers.push(handler)
        scheduledTimeouts.push(timeout)
        return scheduledHandlers.length
      },
      clearInterval: () => undefined,
    })

    expect(scheduledTimeouts).toEqual([30 * 60 * 1000, 5 * 1000])
    wallNow = 40_751
    scheduledHandlers[1]()

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    sync.stop()
  })

  it('does not re-sync when drift is exactly 500 ms', async () => {
    const fetch = makeFetch(30_000)
    let wallNow = 30_250
    const sync = startClockSync({
      fetch,
      db,
      scanId: 'scan-clock',
      sessionId: 'sess-clock',
      now: () => wallNow,
      monotonic: () => 250,
    })

    wallNow = 30_750
    await sync.checkDrift()

    expect(fetch).not.toHaveBeenCalled()
    sync.stop()
  })
})
