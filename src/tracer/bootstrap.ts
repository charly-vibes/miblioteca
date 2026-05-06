import {
  type TracerBulletScan,
  type TracerBulletSession,
  type TracerBulletStore
} from './storage'

type BootstrapDeps = {
  now: () => number
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<{
    ok: boolean
    json: () => Promise<MockScanResponse>
  }>
  store: TracerBulletStore
}

export type MockScanResponse = {
  scanId: string
  sessionId: string
  userId: string
  shortCode: string
  joinToken: string
  serverTimeMs: number
}

export type BootstrapResult = {
  resumed: boolean
  scan: TracerBulletScan
  session: TracerBulletSession
}

export async function bootstrapTracerBullet({ now, fetch, store }: BootstrapDeps): Promise<BootstrapResult> {
  const snapshot = store.read()
  const resumedSession = [...snapshot.sessions]
    .filter((session) => session.status === 'active')
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]

  if (resumedSession) {
    const resumedScan = snapshot.scans.find((scan) => scan.id === resumedSession.scanId)
    if (!resumedScan) {
      throw new Error(`Missing scan for active session ${resumedSession.id}`)
    }

    return {
      resumed: true,
      scan: resumedScan,
      session: resumedSession
    }
  }

  const clientTimeMs = now()
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ clientTimeMs })
  })

  if (!response.ok) {
    throw new Error('Mock scan handshake failed')
  }

  const payload = await response.json()
  if (typeof payload.serverTimeMs !== 'number') {
    throw new Error('Invalid scan response: serverTimeMs is not a number')
  }
  const createdAt = new Date(clientTimeMs).toISOString()
  const scan: TracerBulletScan = {
    id: payload.scanId,
    shortCode: payload.shortCode,
    joinToken: payload.joinToken,
    createdAt
  }
  const session: TracerBulletSession = {
    id: payload.sessionId,
    scanId: payload.scanId,
    userId: payload.userId,
    startedAt: createdAt,
    clockOffsetMs: clientTimeMs - payload.serverTimeMs,
    status: 'active'
  }

  store.write({
    scans: [...snapshot.scans, scan],
    sessions: [...snapshot.sessions, session]
  })

  return {
    resumed: false,
    scan,
    session
  }
}
