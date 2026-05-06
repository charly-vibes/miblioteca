import type { CaptureRecord } from './capture'

const DB_VERSION = 1

const STORES = ['blobs', 'records', 'scans', 'sessions', 'traces', 'thumbnails'] as const

export function openShelfwalkDb(
  idbFactory: IDBFactory = indexedDB,
  dbName = 'shelfwalk'
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = idbFactory.open(dbName, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store)
          if (store === 'records') {
            os.createIndex('by-uploadState', 'uploadState', { unique: false })
          }
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export type SaveCaptureInput = {
  record: CaptureRecord
  imageBlob: Blob
  thumbnailBlob: Blob
}

export function saveCapture(db: IDBDatabase, input: SaveCaptureInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records', 'blobs', 'thumbnails'], 'readwrite')

    tx.objectStore('records').put(input.record, input.record.recordId)
    tx.objectStore('blobs').put(input.imageBlob, input.record.recordId)
    tx.objectStore('thumbnails').put(input.thumbnailBlob, input.record.recordId)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(new Error('saveCapture transaction aborted'))
  })
}

export function loadCaptureRecord(
  db: IDBDatabase,
  recordId: string
): Promise<CaptureRecord | undefined> {
  return idbGet<CaptureRecord>(db, 'records', recordId)
}

export function loadBlob(db: IDBDatabase, recordId: string): Promise<Blob | undefined> {
  return idbGet<Blob>(db, 'blobs', recordId)
}

export function loadThumbnail(db: IDBDatabase, recordId: string): Promise<Blob | undefined> {
  return idbGet<Blob>(db, 'thumbnails', recordId)
}

function idbGet<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}
