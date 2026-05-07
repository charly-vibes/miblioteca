import { beforeEach, describe, expect, it } from 'vitest'
import { createCaptureRecord } from './capture'
import type { CaptureRecord } from './capture'
import { loadCaptureRecord, openShelfwalkDb, putRecord } from './persistence'
import type { ShelfwalkDatabase } from './persistence'
import { loadUploadStatus, retryFailedUploads } from './uploadStatus'

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

function makeRecord(recordId: string, uploadState: CaptureRecord['uploadState'], uploadAttempts = 0) {
  return {
    ...createCaptureRecord(
      { sessionId: 'sess-1', scanId: 'scan-1', userId: 'user-1', index: 0, image: IMAGE_INPUT },
      { now: () => 1746500000000, monotonic: () => 55, generateId: () => recordId }
    ),
    uploadState,
    uploadAttempts,
  }
}

let db: ShelfwalkDatabase

beforeEach(async () => {
  const dbName = `shelfwalk-upload-status-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(dbName)
})

describe('loadUploadStatus', () => {
  it('counts records by upload state and returns rejected records', async () => {
    await putRecord(db, makeRecord('rec-pending', 'pending'))
    await putRecord(db, makeRecord('rec-uploaded', 'uploaded'))
    await putRecord(db, makeRecord('rec-failed-a', 'failed'))
    await putRecord(db, makeRecord('rec-failed-b', 'failed'))
    await putRecord(db, makeRecord('rec-rejected', 'rejected', 5))

    const snapshot = await loadUploadStatus(db)

    expect(snapshot.counts).toEqual({ pending: 1, uploading: 0, uploaded: 1, failed: 2, rejected: 1 })
    expect(snapshot.rejected).toMatchObject([{ recordId: 'rec-rejected', uploadAttempts: 5 }])
  })
})

describe('retryFailedUploads', () => {
  it('moves failed records back to pending without touching rejected records', async () => {
    await putRecord(db, makeRecord('rec-failed', 'failed', 2))
    await putRecord(db, makeRecord('rec-rejected', 'rejected', 5))

    const changed = await retryFailedUploads(db)

    expect(changed).toBe(1)
    expect((await loadCaptureRecord(db, 'rec-failed'))?.uploadState).toBe('pending')
    expect((await loadCaptureRecord(db, 'rec-failed'))?.uploadAttempts).toBe(2)
    expect((await loadCaptureRecord(db, 'rec-rejected'))?.uploadState).toBe('rejected')
  })
})
