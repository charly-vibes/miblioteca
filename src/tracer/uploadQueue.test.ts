import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getRecordsByUploadState,
  loadCaptureRecord,
  openShelfwalkDb,
  putRecord,
  saveCapture,
  updateUploadState,
} from './persistence'
import type { ShelfwalkDatabase } from './persistence'
import { createCaptureRecord } from './capture'
import type { CaptureRecord } from './capture'
import { drainUploadQueue } from './uploadQueue'

const DEPS_BASE = {
  now: () => 1746500000000,
  monotonic: () => 55.0,
  generateId: () => 'rec-drain-1',
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

function makeRecord(recordId: string, uploadState: CaptureRecord['uploadState'] = 'pending') {
  return {
    ...createCaptureRecord(
      { sessionId: 'sess-1', scanId: 'scan-1', userId: 'user-1', index: 0, image: IMAGE_INPUT },
      { ...DEPS_BASE, generateId: () => recordId }
    ),
    uploadState,
  }
}

async function save(record: CaptureRecord) {
  await saveCapture(db, {
    record,
    imageBlob: new Blob([`img-${record.recordId}`]),
    thumbnailBlob: new Blob([`thumb-${record.recordId}`]),
  })
}

let db: ShelfwalkDatabase

beforeEach(async () => {
  const dbName = `shelfwalk-drain-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(dbName)
})

describe('drainUploadQueue', () => {
  it('uploads pending records sequentially with idempotency keys', async () => {
    await save(makeRecord('rec-a'))
    await save(makeRecord('rec-b'))
    const order: string[] = []
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      order.push((init?.headers as Record<string, string>)['Idempotency-Key'])
      return new Response(null, { status: 200 })
    })

    const result = await drainUploadQueue({ db, fetch })

    expect(order).toEqual(['rec-a', 'rec-b'])
    expect(result).toMatchObject({ attempted: 2, uploaded: 2, failed: 0 })
    expect((await loadCaptureRecord(db, 'rec-a'))?.uploadState).toBe('uploaded')
    expect((await loadCaptureRecord(db, 'rec-b'))?.uploadState).toBe('uploaded')
  })

  it('rechecks each record before upload to avoid double-upload with another drain', async () => {
    await save(makeRecord('rec-race'))
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))

    const result = await drainUploadQueue({
      db,
      fetch,
      beforeEachRecord: async (record) => {
        await updateUploadState(db, record.recordId, 'uploaded')
      },
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toMatchObject({ attempted: 0, skipped: 1 })
  })

  it('resets stuck uploading records so the next drain can retry them', async () => {
    await putRecord(db, makeRecord('rec-stuck', 'uploading'))

    const result = await drainUploadQueue({ db, fetch: vi.fn() })

    expect(result.resetStuck).toBe(1)
    expect(await getRecordsByUploadState(db, 'failed')).toHaveLength(1)
  })

  it('skips records whose blobs are missing', async () => {
    await putRecord(db, makeRecord('rec-no-blob'))
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))

    const result = await drainUploadQueue({ db, fetch })

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toMatchObject({ attempted: 0, skipped: 1 })
  })
})
