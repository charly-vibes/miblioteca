import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { CaptureRecord, PreviewFrame } from './capture'
import type { TracerBulletScan, TracerBulletSession } from './storage'

export interface ShelfwalkDB extends DBSchema {
  records: {
    key: string
    value: CaptureRecord
    indexes: { 'by-uploadState': CaptureRecord['uploadState'] }
  }
  blobs: {
    key: string
    value: Blob
  }
  thumbnails: {
    key: string
    value: Blob
  }
  scans: {
    key: string
    value: TracerBulletScan
  }
  sessions: {
    key: string
    value: TracerBulletSession
  }
  traces: {
    key: string
    value: unknown
  }
  previewFrames: {
    key: string
    value: PreviewFrame
  }
  previewBlobs: {
    key: string
    value: Blob
  }
}

export type ShelfwalkDatabase = IDBPDatabase<ShelfwalkDB>

export function openShelfwalkDb(name = 'shelfwalk'): Promise<ShelfwalkDatabase> {
  return openDB<ShelfwalkDB>(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const records = db.createObjectStore('records')
        records.createIndex('by-uploadState', 'uploadState')
        db.createObjectStore('blobs')
        db.createObjectStore('thumbnails')
        db.createObjectStore('scans')
        db.createObjectStore('sessions')
        db.createObjectStore('traces')
      }
      if (oldVersion < 2) {
        db.createObjectStore('previewFrames')
        db.createObjectStore('previewBlobs')
      }
    },
  })
}

export type SaveCaptureInput = {
  record: CaptureRecord
  imageBlob: Blob
  thumbnailBlob: Blob
}

export async function saveCapture(db: ShelfwalkDatabase, input: SaveCaptureInput): Promise<void> {
  const tx = db.transaction(['records', 'blobs', 'thumbnails'], 'readwrite')
  tx.objectStore('records').put(input.record, input.record.recordId)
  tx.objectStore('blobs').put(input.imageBlob, input.record.recordId)
  tx.objectStore('thumbnails').put(input.thumbnailBlob, input.record.recordId)
  await tx.done
}

export function loadCaptureRecord(
  db: ShelfwalkDatabase,
  recordId: string
): Promise<CaptureRecord | undefined> {
  return db.get('records', recordId)
}

export function loadBlob(db: ShelfwalkDatabase, recordId: string): Promise<Blob | undefined> {
  return db.get('blobs', recordId)
}

export function loadThumbnail(db: ShelfwalkDatabase, recordId: string): Promise<Blob | undefined> {
  return db.get('thumbnails', recordId)
}

export async function updateUploadState(
  db: ShelfwalkDatabase,
  recordId: string,
  uploadState: CaptureRecord['uploadState']
): Promise<void> {
  const tx = db.transaction('records', 'readwrite')
  const record = await tx.store.get(recordId)
  if (record) {
    tx.store.put({ ...record, uploadState }, recordId)
  }
  await tx.done
}

export async function updateUploadProgress(
  db: ShelfwalkDatabase,
  recordId: string,
  uploadState: CaptureRecord['uploadState'],
  uploadAttempts: number
): Promise<void> {
  const tx = db.transaction('records', 'readwrite')
  const record = await tx.store.get(recordId)
  if (!record) {
    tx.abort()
    throw new Error(`updateUploadProgress: record not found: ${recordId}`)
  }
  tx.store.put({ ...record, uploadState, uploadAttempts }, recordId)
  await tx.done
}
