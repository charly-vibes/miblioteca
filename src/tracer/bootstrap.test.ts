import { describe, expect, it, vi } from 'vitest'
import { bootstrapTracerBullet, type MockScanResponse } from './bootstrap'
import { createInMemoryTracerBulletStore } from './storage'

function makeMockFetch(response: MockScanResponse) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => ({
    ok: true,
    json: async () => response,
    request: { input, init }
  }))
}

describe('bootstrapTracerBullet', () => {
  it('creates and stores a fresh scan + capture session from the mock /api/scan handshake', async () => {
    const store = createInMemoryTracerBulletStore()
    const fetch = makeMockFetch({
      scanId: 'scan-1',
      sessionId: 'session-1',
      userId: 'user-1',
      shortCode: 'TB42',
      joinToken: 'join-1',
      serverTimeMs: 1000
    })

    const result = await bootstrapTracerBullet({
      now: () => 1350,
      fetch,
      store
    })

    expect(fetch).toHaveBeenCalledWith('/api/scan', expect.objectContaining({ method: 'POST' }))
    expect(result.resumed).toBe(false)
    expect(result.scan).toMatchObject({
      id: 'scan-1',
      shortCode: 'TB42',
      joinToken: 'join-1'
    })
    expect(result.session).toMatchObject({
      id: 'session-1',
      scanId: 'scan-1',
      userId: 'user-1',
      clockOffsetMs: 350,
      status: 'active'
    })
    expect(store.snapshot()).toEqual({
      scans: [result.scan],
      sessions: [result.session]
    })
  })

  it('resumes the latest incomplete session on reload without creating duplicates', async () => {
    const store = createInMemoryTracerBulletStore({
      scans: [
        {
          id: 'scan-1',
          shortCode: 'TB42',
          joinToken: 'join-1',
          createdAt: '2026-05-06T18:00:00.000Z'
        },
        {
          id: 'scan-2',
          shortCode: 'TB43',
          joinToken: 'join-2',
          createdAt: '2026-05-06T18:05:00.000Z'
        }
      ],
      sessions: [
        {
          id: 'session-2',
          scanId: 'scan-2',
          userId: 'user-2',
          startedAt: '2026-05-06T18:05:00.000Z',
          clockOffsetMs: 360,
          status: 'active'
        },
        {
          id: 'session-1',
          scanId: 'scan-1',
          userId: 'user-1',
          startedAt: '2026-05-06T18:00:00.000Z',
          clockOffsetMs: 350,
          status: 'active'
        }
      ]
    })
    const fetch = makeMockFetch({
      scanId: 'scan-3',
      sessionId: 'session-3',
      userId: 'user-3',
      shortCode: 'TB44',
      joinToken: 'join-3',
      serverTimeMs: 2000
    })

    const result = await bootstrapTracerBullet({
      now: () => 2400,
      fetch,
      store
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(result.resumed).toBe(true)
    expect(result.scan.id).toBe('scan-2')
    expect(result.session.id).toBe('session-2')
    expect(store.snapshot()).toEqual({
      scans: [
        {
          id: 'scan-1',
          shortCode: 'TB42',
          joinToken: 'join-1',
          createdAt: '2026-05-06T18:00:00.000Z'
        },
        result.scan
      ],
      sessions: [result.session, {
        id: 'session-1',
        scanId: 'scan-1',
        userId: 'user-1',
        startedAt: '2026-05-06T18:00:00.000Z',
        clockOffsetMs: 350,
        status: 'active'
      }]
    })
  })
})
