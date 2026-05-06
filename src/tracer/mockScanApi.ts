type MockFetchResponse = {
  ok: boolean
  json: () => Promise<{
    scanId: string
    sessionId: string
    userId: string
    shortCode: string
    joinToken: string
    serverTimeMs: number
  }>
}

export function createMockScanFetch(now: () => number) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<MockFetchResponse> => {
    const path = typeof input === 'string' ? input : input.toString()
    if (path !== '/api/scan' || init?.method !== 'POST') {
      return {
        ok: false,
        json: async () => {
          throw new Error(`Unsupported mock request: ${init?.method ?? 'GET'} ${path}`)
        }
      }
    }

    const issuedAt = now()
    const suffix = String(issuedAt)
    const scanNumber = suffix.slice(-4).padStart(4, '0')

    return {
      ok: true,
      json: async () => ({
        scanId: `scan-${suffix}`,
        sessionId: `session-${suffix}`,
        userId: 'tracer-bullet-user',
        shortCode: `TB-${scanNumber}`,
        joinToken: `join-${suffix}`,
        serverTimeMs: issuedAt - 250
      })
    }
  }
}
