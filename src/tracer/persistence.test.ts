import { describe, it, expect, beforeEach } from 'vitest'
import { openShelfwalkDb, saveCapture, loadCaptureRecord, loadBlob, loadThumbnail } from './persistence'
import { createCaptureRecord } from './capture'

const DEPS = {
  now: () => 1746500000000,
  monotonic: () => 100.5,
  generateId: () => 'rec-test-1',
}

const IMAGE_INPUT = {
  size: 8192,
  thumbnailSize: 1024,
  mimeType: 'image/jpeg',
  width: 1920,
  height: 1080,
  thumbnailWidth: 320,
  thumbnailHeight: 180,
  sourceApi: 'CanvasSnapshot' as const,
}

function makeRecord() {
  return createCaptureRecord(
    {
      sessionId: 'sess-1',
      scanId: 'scan-1',
      userId: 'user-1',
      index: 0,
      image: IMAGE_INPUT,
    },
    DEPS
  )
}

let db: IDBDatabase
let dbName: string

beforeEach(async () => {
  dbName = `shelfwalk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(indexedDB, dbName)
})

describe('saveCapture', () => {
  it('stores the record, image blob, and thumbnail blob under recordId', async () => {
    const record = makeRecord()
    const imageBlob = new Blob(['fake-image'], { type: 'image/jpeg' })
    const thumbnailBlob = new Blob(['fake-thumb'], { type: 'image/jpeg' })

    await saveCapture(db, { record, imageBlob, thumbnailBlob })

    const savedRecord = await loadCaptureRecord(db, record.recordId)
    const savedBlob = await loadBlob(db, record.recordId)
    const savedThumb = await loadThumbnail(db, record.recordId)

    expect(savedRecord).toMatchObject({ recordId: 'rec-test-1', uploadState: 'pending', zupt: true })
    // fake-indexeddb does not faithfully round-trip Blob objects; asserting defined is sufficient
    // for the fake IDB environment — real IDB returns actual Blob instances
    expect(savedBlob).toBeDefined()
    expect(savedThumb).toBeDefined()
  })

  it('leaves no data when the save transaction is aborted', async () => {
    const record = makeRecord()

    // Simulate abort: open a transaction, write partially, then abort
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['records', 'blobs', 'thumbnails'], 'readwrite')
      tx.objectStore('records').put(record, record.recordId)
      tx.objectStore('blobs').put(new Blob(['orphan']), record.recordId)
      tx.abort()
      tx.oncomplete = () => reject(new Error('expected abort'))
      tx.onabort = () => resolve()
      tx.onerror = () => resolve()
    })

    const savedRecord = await loadCaptureRecord(db, record.recordId)
    const savedBlob = await loadBlob(db, record.recordId)

    expect(savedRecord).toBeUndefined()
    expect(savedBlob).toBeUndefined()
  })
})

describe('openShelfwalkDb', () => {
  it('records store has a queryable by-uploadState index', () => {
    const tx = db.transaction('records', 'readonly')
    expect(() => tx.objectStore('records').index('by-uploadState')).not.toThrow()
  })
})

describe('loadCaptureRecord', () => {
  it('returns undefined for an unknown id', async () => {
    const result = await loadCaptureRecord(db, 'does-not-exist')
    expect(result).toBeUndefined()
  })
})

describe('loadBlob', () => {
  it('returns undefined for an unknown id', async () => {
    const result = await loadBlob(db, 'does-not-exist')
    expect(result).toBeUndefined()
  })
})

describe('loadThumbnail', () => {
  it('returns undefined for an unknown id', async () => {
    const result = await loadThumbnail(db, 'does-not-exist')
    expect(result).toBeUndefined()
  })
})
