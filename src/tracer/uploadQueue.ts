import type { CaptureRecord } from './capture'
import {
  getRecordsByUploadState,
  loadBlob,
  loadCaptureRecord,
  loadThumbnail,
  updateUploadState,
} from './persistence'
import type { ShelfwalkDatabase } from './persistence'
import { uploadCapture } from './upload'

export type DrainUploadQueueDeps = {
  db: ShelfwalkDatabase
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
  beforeEachRecord?: (record: CaptureRecord) => Promise<void>
  onRecordError?: (record: CaptureRecord, error: unknown) => void
}

export type DrainUploadQueueResult = {
  attempted: number
  uploaded: number
  failed: number
  skipped: number
  resetStuck: number
}

export async function drainUploadQueue({
  db,
  fetch,
  beforeEachRecord,
  onRecordError,
}: DrainUploadQueueDeps): Promise<DrainUploadQueueResult> {
  const result: DrainUploadQueueResult = {
    attempted: 0,
    uploaded: 0,
    failed: 0,
    skipped: 0,
    resetStuck: 0,
  }

  const stuck = await getRecordsByUploadState(db, 'uploading')
  for (const record of stuck) {
    await updateUploadState(db, record.recordId, 'failed')
    result.resetStuck += 1
  }

  const candidates = [
    ...(await getRecordsByUploadState(db, 'pending')),
    ...(await getRecordsByUploadState(db, 'failed')),
  ]

  for (const snapshot of candidates) {
    if (beforeEachRecord) await beforeEachRecord(snapshot)

    const record = await loadCaptureRecord(db, snapshot.recordId)
    if (!record || (record.uploadState !== 'pending' && record.uploadState !== 'failed')) {
      result.skipped += 1
      continue
    }

    const imageBlob = await loadBlob(db, record.recordId)
    const thumbnailBlob = await loadThumbnail(db, record.recordId)
    if (!imageBlob || !thumbnailBlob) {
      result.skipped += 1
      continue
    }

    try {
      const uploadResult = await uploadCapture(record, imageBlob, thumbnailBlob, { fetch, db })
      result.attempted += 1
      if (uploadResult.uploadState === 'uploaded') {
        result.uploaded += 1
      } else {
        result.failed += 1
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('uploadCapture: record no longer uploadable:')) {
        result.skipped += 1
        continue
      }
      result.failed += 1
      onRecordError?.(record, error)
    }
  }

  return result
}
