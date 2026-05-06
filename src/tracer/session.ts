import type { ShelfwalkDatabase } from './persistence'
import { getAllSessions, getAllRecords, putSession } from './persistence'
import type { TracerBulletSession } from './storage'

export function startSession(db: ShelfwalkDatabase, session: TracerBulletSession): Promise<string> {
  if (session.status !== 'active')
    return Promise.reject(new Error(`startSession: expected active session, got ${session.status}`))
  return putSession(db, session)
}

export async function endSession(
  db: ShelfwalkDatabase,
  sessionId: string,
  endedAt: string
): Promise<void> {
  const tx = db.transaction('sessions', 'readwrite')
  const session = await tx.store.get(sessionId)
  if (!session) {
    await tx.done.catch(() => undefined)
    throw new Error(`endSession: session not found: ${sessionId}`)
  }
  tx.store.put({ ...session, endedAt, status: 'completed' as const }, sessionId)
  await tx.done
}

export async function recoverCrashedSessions(
  db: ShelfwalkDatabase
): Promise<TracerBulletSession[]> {
  const sessions = await getAllSessions(db)
  const crashed = sessions.filter((s) => s.status === 'active')
  if (crashed.length === 0) return []

  const allRecords = await getAllRecords(db)
  const recovered: TracerBulletSession[] = []

  for (const session of crashed) {
    const sessionRecords = allRecords.filter((r) => r.sessionId === session.id)
    const endedAt =
      sessionRecords.length > 0
        ? sessionRecords.reduce(
            (max, r) => (r.capturedAt > max ? r.capturedAt : max),
            sessionRecords[0].capturedAt
          )
        : session.startedAt

    const fixed: TracerBulletSession = { ...session, endedAt, status: 'completed' }
    await putSession(db, fixed)
    recovered.push(fixed)
  }

  return recovered
}
