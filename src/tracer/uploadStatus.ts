import type { CaptureRecord } from './capture'
import { getAllRecords } from './persistence'
import type { ShelfwalkDatabase } from './persistence'

export const UPLOAD_STATES = ['pending', 'uploading', 'uploaded', 'failed', 'rejected'] as const

export type UploadStatusCount = (typeof UPLOAD_STATES)[number]

export type UploadStatusSnapshot = {
  counts: Record<UploadStatusCount, number>
  rejected: CaptureRecord[]
}

export async function loadUploadStatus(db: ShelfwalkDatabase): Promise<UploadStatusSnapshot> {
  const records = await getAllRecords(db)
  const counts = Object.fromEntries(UPLOAD_STATES.map((state) => [state, 0])) as Record<UploadStatusCount, number>

  const rejected: CaptureRecord[] = []
  for (const record of records) {
    counts[record.uploadState] += 1
    if (record.uploadState === 'rejected') rejected.push(record)
  }

  rejected.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
  return { counts, rejected }
}

export async function retryFailedUploads(db: ShelfwalkDatabase): Promise<number> {
  const tx = db.transaction('records', 'readwrite')
  const failed = await tx.store.index('by-uploadState').getAll('failed')
  for (const record of failed) {
    tx.store.put({ ...record, uploadState: 'pending' }, record.recordId)
  }
  await tx.done
  return failed.length
}
