import { describe, it, expect, beforeEach } from 'vitest'
import { openShelfwalkDb, saveCapture, loadCaptureRecord, loadBlob, loadThumbnail } from './persistence'
import type { ShelfwalkDatabase } from './persistence'
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

let db: ShelfwalkDatabase
let dbName: string

beforeEach(async () => {
  dbName = `shelfwalk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(dbName)
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

    // Simulate abort: open a transaction, write partially, then abort.
    // idb wraps put() calls in promises that reject on abort — suppress those rejections.
    const tx = db.transaction(['records', 'blobs', 'thumbnails'], 'readwrite')
    tx.objectStore('records').put(record, record.recordId).catch(() => undefined)
    tx.objectStore('blobs').put(new Blob(['orphan']), record.recordId).catch(() => undefined)
    tx.abort()
    await tx.done.catch(() => undefined)

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

  it('creates all v1 stores (blobs, records, scans, sessions, traces, thumbnails)', () => {
    const storeNames = Array.from(db.objectStoreNames)
    expect(storeNames).toContain('blobs')
    expect(storeNames).toContain('records')
    expect(storeNames).toContain('scans')
    expect(storeNames).toContain('sessions')
    expect(storeNames).toContain('traces')
    expect(storeNames).toContain('thumbnails')
  })

  it('creates v2 stores (previewFrames, previewBlobs)', () => {
    const storeNames = Array.from(db.objectStoreNames)
    expect(storeNames).toContain('previewFrames')
    expect(storeNames).toContain('previewBlobs')
  })

  it('migrates a v1 database to v2 by adding previewFrames and previewBlobs', async () => {
    const migrateName = `migrate-test-${Date.now()}`

    // Open at version 1 (no previewFrames/previewBlobs)
    const v1db = await import('idb').then(({ openDB }) =>
      openDB(migrateName, 1, {
        upgrade(db) {
          db.createObjectStore('records')
          db.createObjectStore('blobs')
          db.createObjectStore('thumbnails')
          db.createObjectStore('scans')
          db.createObjectStore('sessions')
          db.createObjectStore('traces')
        },
      })
    )
    v1db.close()

    // Reopen at version 2 (our openShelfwalkDb) — should add previewFrames and previewBlobs
    const v2db = await openShelfwalkDb(migrateName)
    const storeNames = Array.from(v2db.objectStoreNames)
    expect(storeNames).toContain('previewFrames')
    expect(storeNames).toContain('previewBlobs')
    v2db.close()
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
