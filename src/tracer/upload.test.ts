import { describe, it, expect, beforeEach } from 'vitest'
import { uploadCapture } from './upload'
import { openShelfwalkDb, saveCapture, loadCaptureRecord } from './persistence'
import { createCaptureRecord } from './capture'
import type { CaptureRecord } from './capture'

const DEPS_BASE = {
  now: () => 1746500000000,
  monotonic: () => 55.0,
  generateId: () => 'rec-upload-1',
}

const IMAGE_INPUT = {
  size: 4096,
  thumbnailSize: 512,
  mimeType: 'image/jpeg',
  width: 1280,
  height: 720,
  thumbnailWidth: 160,
  thumbnailHeight: 90,
  sourceApi: 'CanvasSnapshot' as const,
}

function makeRecord() {
  return createCaptureRecord(
    { sessionId: 'sess-1', scanId: 'scan-1', userId: 'user-1', index: 0, image: IMAGE_INPUT },
    DEPS_BASE
  )
}

let db: IDBDatabase

beforeEach(async () => {
  const dbName = `shelfwalk-upload-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(indexedDB, dbName)
})

// Capture the last request the mock fetch received so tests can inspect it
type CapturedRequest = { url: string; init: RequestInit }

function makeMockFetch(status: number): {
  fetch: typeof globalThis.fetch
  lastRequest: () => CapturedRequest
} {
  let captured: CapturedRequest = { url: '', init: {} }
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    captured = { url: String(input), init: init ?? {} }
    return new Response(null, { status })
  }
  return { fetch, lastRequest: () => captured }
}

async function saveAndUpload(
  record: CaptureRecord,
  imageBlob: Blob,
  thumbnailBlob: Blob,
  fetch: typeof globalThis.fetch
) {
  await saveCapture(db, { record, imageBlob, thumbnailBlob })
  return uploadCapture(record, imageBlob, thumbnailBlob, { fetch, db })
}

describe('uploadCapture — request shape', () => {
  it('POSTs to /api/upload with Idempotency-Key header', async () => {
    const record = makeRecord()
    const { fetch, lastRequest } = makeMockFetch(200)

    await saveAndUpload(record, new Blob(['img']), new Blob(['thumb']), fetch)

    expect(lastRequest().url).toBe('/api/upload')
    expect(lastRequest().init.method).toBe('POST')
    const headers = lastRequest().init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBe(record.recordId)
  })

  it('sends a FormData body with record, image, and thumbnail fields', async () => {
    const record = makeRecord()
    const { fetch, lastRequest } = makeMockFetch(200)

    await saveAndUpload(record, new Blob(['img']), new Blob(['thumb']), fetch)

    const body = lastRequest().init.body
    expect(body).toBeInstanceOf(FormData)
    const fd = body as FormData
    expect(fd.get('record')).not.toBeNull()
    expect(fd.get('image')).not.toBeNull()
    expect(fd.get('thumbnail')).not.toBeNull()
  })

  it('strips blobRef, thumbnailBlobRef, and uploadState from the serialized record', async () => {
    const record = makeRecord()
    const { fetch, lastRequest } = makeMockFetch(200)

    await saveAndUpload(record, new Blob(['img']), new Blob(['thumb']), fetch)

    const body = lastRequest().init.body as FormData
    const serialized = JSON.parse(body.get('record') as string)
    expect(serialized.image).not.toHaveProperty('blobRef')
    expect(serialized.image).not.toHaveProperty('thumbnailBlobRef')
    expect(serialized).not.toHaveProperty('uploadState')
  })

  it('preserves other record fields in the serialized record', async () => {
    const record = makeRecord()
    const { fetch, lastRequest } = makeMockFetch(200)

    await saveAndUpload(record, new Blob(['img']), new Blob(['thumb']), fetch)

    const body = lastRequest().init.body as FormData
    const serialized = JSON.parse(body.get('record') as string)
    expect(serialized.recordId).toBe(record.recordId)
    expect(serialized.zupt).toBe(true)
    expect(serialized.image.mimeType).toBe('image/jpeg')
  })
})

describe('uploadCapture — state transitions', () => {
  it('updates uploadState to uploaded on 200 response', async () => {
    const record = makeRecord()
    const imageBlob = new Blob(['img'])
    const thumbnailBlob = new Blob(['thumb'])
    await saveCapture(db, { record, imageBlob, thumbnailBlob })

    const { fetch } = makeMockFetch(200)
    const result = await uploadCapture(record, imageBlob, thumbnailBlob, { fetch, db })

    expect(result.uploadState).toBe('uploaded')
    const persisted = await loadCaptureRecord(db, record.recordId)
    expect(persisted?.uploadState).toBe('uploaded')
  })

  it('updates uploadState to failed on non-2xx response', async () => {
    const record = makeRecord()
    const imageBlob = new Blob(['img'])
    const thumbnailBlob = new Blob(['thumb'])
    await saveCapture(db, { record, imageBlob, thumbnailBlob })

    const { fetch } = makeMockFetch(503)
    const result = await uploadCapture(record, imageBlob, thumbnailBlob, { fetch, db })

    expect(result.uploadState).toBe('failed')
    const persisted = await loadCaptureRecord(db, record.recordId)
    expect(persisted?.uploadState).toBe('failed')
  })

  it('updates uploadState to failed on network error', async () => {
    const record = makeRecord()
    const imageBlob = new Blob(['img'])
    const thumbnailBlob = new Blob(['thumb'])
    await saveCapture(db, { record, imageBlob, thumbnailBlob })

    const networkErrorFetch = async (): Promise<Response> => {
      throw new TypeError('Failed to fetch')
    }
    const result = await uploadCapture(record, imageBlob, thumbnailBlob, {
      fetch: networkErrorFetch,
      db,
    })

    expect(result.uploadState).toBe('failed')
    const persisted = await loadCaptureRecord(db, record.recordId)
    expect(persisted?.uploadState).toBe('failed')
  })
})
