type MockScanPayload = {
  scanId: string
  sessionId: string
  userId: string
  shortCode: string
  joinToken: string
  serverTimeMs: number
}

type MockFetchResponse = {
  ok: boolean
  status: number
  json: () => Promise<MockScanPayload>
}

export function createMockScanFetch(now: () => number) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<MockFetchResponse> => {
    const path = typeof input === 'string' ? input : input.toString()
    if (init?.method !== 'POST') return unsupported(path, init)

    if (path === '/api/scan') return okResponse(makePayload(now(), 'tracer-bullet-user'))
    if (path === '/api/scan/join') {
      const body = parseBody(init.body)
      if (!body.shortCode || !body.joinToken || !body.displayName) return unsupported(path, init, 400)
      const issuedAt = now()
      return okResponse({
        ...makePayload(issuedAt, `user-${slug(String(body.displayName))}`),
        scanId: `scan-${slug(String(body.shortCode))}`,
        shortCode: String(body.shortCode),
        joinToken: String(body.joinToken),
      })
    }

    return unsupported(path, init)
  }
}

function makePayload(issuedAt: number, userId: string): MockScanPayload {
  const suffix = String(issuedAt)
  const scanNumber = suffix.slice(-4).padStart(4, '0')
  return {
    scanId: `scan-${suffix}`,
    sessionId: `session-${suffix}`,
    userId,
    shortCode: `TB-${scanNumber}`,
    joinToken: `join-${suffix}`,
    serverTimeMs: issuedAt - 250,
  }
}

function okResponse(payload: MockScanPayload): MockFetchResponse {
  return { ok: true, status: 200, json: async () => payload }
}

function unsupported(path: string, init: RequestInit | undefined, status = 404): MockFetchResponse {
  return {
    ok: false,
    status,
    json: async () => {
      throw new Error(`Unsupported mock request: ${init?.method ?? 'GET'} ${path}`)
    },
  }
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string') return {}
  try {
    const parsed = JSON.parse(body) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'anonymous'
}
