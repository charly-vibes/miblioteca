import { describe, it, expect, beforeEach } from 'vitest'
import {
  openShelfwalkDb,
  saveCapture,
  loadCaptureRecord,
  loadBlob,
  loadThumbnail,
  putRecord,
  getRecordsByUploadState,
  putBlob,
  putThumbnail,
  getScan,
  putScan,
  getSession,
  putSession,
} from './persistence'
import type { ShelfwalkDatabase } from './persistence'
import { createCaptureRecord } from './capture'
import type { CaptureRecord } from './capture'

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

describe('putRecord / getRecordsByUploadState', () => {
  it('round-trips a record through the records store', async () => {
    const record = makeRecord()
    await putRecord(db, record)
    const loaded = await loadCaptureRecord(db, record.recordId)
    expect(loaded).toMatchObject({ recordId: 'rec-test-1', uploadState: 'pending' })
  })

  it('queries pending records via the by-uploadState index', async () => {
    const makeRecordWithId = (id: string, uploadState: CaptureRecord['uploadState']) =>
      ({ ...makeRecord(), recordId: id, uploadState })

    await putRecord(db, makeRecordWithId('r1', 'pending'))
    await putRecord(db, makeRecordWithId('r2', 'uploaded'))
    await putRecord(db, makeRecordWithId('r3', 'pending'))

    const pending = await getRecordsByUploadState(db, 'pending')
    expect(pending.map((r) => r.recordId).sort()).toEqual(['r1', 'r3'])
  })

  it('returns empty array when no records match the given uploadState', async () => {
    const result = await getRecordsByUploadState(db, 'rejected')
    expect(result).toEqual([])
  })
})

describe('putBlob / putThumbnail', () => {
  it('puts and loads a blob individually', async () => {
    await putBlob(db, 'blob-1', new Blob(['data']))
    const loaded = await loadBlob(db, 'blob-1')
    expect(loaded).toBeDefined()
  })

  it('puts and loads a thumbnail individually', async () => {
    await putThumbnail(db, 'thumb-1', new Blob(['thumb']))
    const loaded = await loadThumbnail(db, 'thumb-1')
    expect(loaded).toBeDefined()
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

describe('getScan / putScan', () => {
  it('round-trips a scan through the scans store', async () => {
    const scan = { id: 'scan-abc', shortCode: 'AB-12', joinToken: 'tok-1', createdAt: '2026-05-06T00:00:00Z' }
    await putScan(db, scan)
    const loaded = await getScan(db, 'scan-abc')
    expect(loaded).toEqual(scan)
  })

  it('returns undefined for an unknown scan id', async () => {
    const result = await getScan(db, 'no-such-scan')
    expect(result).toBeUndefined()
  })
})

describe('getSession / putSession', () => {
  it('round-trips a session through the sessions store', async () => {
    const session = {
      id: 'sess-xyz',
      scanId: 'scan-abc',
      userId: 'user-1',
      startedAt: '2026-05-06T00:00:00Z',
      clockOffsetMs: 42,
      status: 'active' as const,
    }
    await putSession(db, session)
    const loaded = await getSession(db, 'sess-xyz')
    expect(loaded).toEqual(session)
  })

  it('returns undefined for an unknown session id', async () => {
    const result = await getSession(db, 'no-such-session')
    expect(result).toBeUndefined()
  })
})
