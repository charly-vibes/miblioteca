import { describe, expect, it } from 'vitest'
import { createMockScanFetch } from './mockScanApi'

describe('createMockScanFetch', () => {
  it('supports dev create-scan requests', async () => {
    const fetch = createMockScanFetch(() => 1_000)

    const response = await fetch('/api/scan', { method: 'POST', body: JSON.stringify({ clientTimeMs: 1_000 }) })
    const body = await response.json()

    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      scanId: 'scan-1000',
      sessionId: 'session-1000',
      userId: 'tracer-bullet-user',
      shortCode: 'TB-1000',
      joinToken: 'join-1000',
      serverTimeMs: 750,
    })
  })

  it('supports dev join-scan requests', async () => {
    const fetch = createMockScanFetch(() => 2_000)

    const response = await fetch('/api/scan/join', {
      method: 'POST',
      body: JSON.stringify({ shortCode: 'BARN-7K9', joinToken: 'join-token', displayName: 'Alice' }),
    })
    const body = await response.json()

    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      scanId: 'scan-barn-7k9',
      sessionId: 'session-2000',
      userId: 'user-alice',
      shortCode: 'BARN-7K9',
      joinToken: 'join-token',
      serverTimeMs: 1_750,
    })
  })

  it('rejects malformed dev join requests with 400', async () => {
    const fetch = createMockScanFetch(() => 2_000)

    const response = await fetch('/api/scan/join', {
      method: 'POST',
      body: JSON.stringify({ shortCode: 'BARN-7K9' }),
    })

    expect(response.ok).toBe(false)
    expect(response.status).toBe(400)
  })
})
