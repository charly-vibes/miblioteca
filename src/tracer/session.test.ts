import { describe, it, expect, beforeEach } from 'vitest'
import { openShelfwalkDb, putRecord, putSession } from './persistence'
import type { ShelfwalkDatabase } from './persistence'
import { startSession, endSession, recoverCrashedSessions } from './session'
import { createCaptureRecord } from './capture'
import type { TracerBulletSession } from './storage'

const BASE_SESSION: TracerBulletSession = {
  id: 'sess-1',
  scanId: 'scan-1',
  userId: 'user-1',
  startedAt: '2026-05-06T10:00:00.000Z',
  clockOffsetMs: 0,
  status: 'active',
}

function makeRecord(id: string, sessionId: string, capturedAt: string) {
  const rec = createCaptureRecord(
    {
      sessionId,
      scanId: 'scan-1',
      userId: 'user-1',
      index: 0,
      image: {
        size: 8192,
        thumbnailSize: 1024,
        mimeType: 'image/jpeg',
        width: 1920,
        height: 1080,
        thumbnailWidth: 320,
        thumbnailHeight: 180,
        sourceApi: 'CanvasSnapshot',
      },
    },
    { now: () => new Date(capturedAt).getTime(), monotonic: () => 0, generateId: () => id }
  )
  return rec
}

let db: ShelfwalkDatabase

beforeEach(async () => {
  const name = `shelfwalk-sess-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(name)
})

describe('startSession', () => {
  it('writes an active session to IDB', async () => {
    await startSession(db, BASE_SESSION)
    const loaded = await db.get('sessions', 'sess-1')
    expect(loaded).toMatchObject({ id: 'sess-1', status: 'active', startedAt: BASE_SESSION.startedAt })
  })

  it('overwrites an existing session', async () => {
    await startSession(db, BASE_SESSION)
    const updated = { ...BASE_SESSION, clockOffsetMs: 99 }
    await startSession(db, updated)
    const loaded = await db.get('sessions', 'sess-1')
    expect(loaded?.clockOffsetMs).toBe(99)
  })

  it('throws when called with a non-active session', async () => {
    const completed = { ...BASE_SESSION, status: 'completed' as const, endedAt: '2026-05-06T11:00:00.000Z' }
    await expect(startSession(db, completed)).rejects.toThrow('startSession: expected active session, got completed')
  })
})

describe('endSession', () => {
  it('marks the session completed and sets endedAt', async () => {
    await startSession(db, BASE_SESSION)
    await endSession(db, 'sess-1', '2026-05-06T11:00:00.000Z')
    const loaded = await db.get('sessions', 'sess-1')
    expect(loaded?.status).toBe('completed')
    expect(loaded?.endedAt).toBe('2026-05-06T11:00:00.000Z')
  })

  it('throws when the session does not exist', async () => {
    await expect(endSession(db, 'no-such-session', '2026-05-06T11:00:00.000Z')).rejects.toThrow(
      'endSession: session not found: no-such-session'
    )
  })
})

describe('recoverCrashedSessions', () => {
  it('returns empty array when there are no active sessions', async () => {
    const completed = { ...BASE_SESSION, status: 'completed' as const, endedAt: '2026-05-06T11:00:00.000Z' }
    await putSession(db, completed)
    const recovered = await recoverCrashedSessions(db)
    expect(recovered).toEqual([])
  })

  it('recovers a crashed session using max capturedAt from its records', async () => {
    await startSession(db, BASE_SESSION)

    const r1 = makeRecord('rec-1', 'sess-1', '2026-05-06T10:05:00.000Z')
    const r2 = makeRecord('rec-2', 'sess-1', '2026-05-06T10:30:00.000Z')
    const r3 = makeRecord('rec-3', 'sess-1', '2026-05-06T10:15:00.000Z')
    await putRecord(db, r1)
    await putRecord(db, r2)
    await putRecord(db, r3)

    const recovered = await recoverCrashedSessions(db)

    expect(recovered).toHaveLength(1)
    expect(recovered[0].status).toBe('completed')
    expect(recovered[0].endedAt).toBe('2026-05-06T10:30:00.000Z')

    // Verify persisted in IDB
    const loaded = await db.get('sessions', 'sess-1')
    expect(loaded?.status).toBe('completed')
    expect(loaded?.endedAt).toBe('2026-05-06T10:30:00.000Z')
  })

  it('uses startedAt as endedAt when the session has no records (crashed before first capture)', async () => {
    await startSession(db, BASE_SESSION)

    const recovered = await recoverCrashedSessions(db)

    expect(recovered).toHaveLength(1)
    expect(recovered[0].endedAt).toBe(BASE_SESSION.startedAt)
    expect(recovered[0].status).toBe('completed')
  })

  it('only recovers active sessions, leaves completed ones alone', async () => {
    const s1 = { ...BASE_SESSION, id: 'sess-active' }
    const s2 = {
      ...BASE_SESSION,
      id: 'sess-done',
      status: 'completed' as const,
      endedAt: '2026-05-06T09:00:00.000Z',
    }
    await startSession(db, s1)
    await putSession(db, s2)

    const recovered = await recoverCrashedSessions(db)

    expect(recovered).toHaveLength(1)
    expect(recovered[0].id).toBe('sess-active')

    // completed session must be untouched
    const done = await db.get('sessions', 'sess-done')
    expect(done?.endedAt).toBe('2026-05-06T09:00:00.000Z')
  })

  it("ignores records that belong to other sessions when inferring endedAt", async () => {
    const s1 = { ...BASE_SESSION, id: 'sess-crashed', startedAt: '2026-05-06T08:00:00.000Z' }
    const s2 = { ...BASE_SESSION, id: 'sess-other' }
    await startSession(db, s1)
    await startSession(db, s2)

    // Records for the other session should not influence s1's endedAt
    const r = makeRecord('rec-other', 'sess-other', '2026-05-06T12:00:00.000Z')
    await putRecord(db, r)
    await endSession(db, 'sess-other', '2026-05-06T12:01:00.000Z')

    const recovered = await recoverCrashedSessions(db)
    expect(recovered).toHaveLength(1)
    expect(recovered[0].id).toBe('sess-crashed')
    expect(recovered[0].endedAt).toBe(s1.startedAt)
  })
})
