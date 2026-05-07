import { describe, it, expect, beforeEach, vi } from 'vitest'
import JSZip from 'jszip'
import {
  openShelfwalkDb,
  saveCapture,
  putScan,
  putSession,
  loadBlob,
  loadThumbnail,
  getSessionBundleDeliveryState,
} from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import { assembleBundle } from './assemble'
import type { CaptureRecord } from '../tracer/capture'
import type { TracerBulletScan, TracerBulletSession } from '../tracer/storage'
import type { BundleManifest } from './types'

function makeScan(partial: Partial<TracerBulletScan> = {}): TracerBulletScan {
  return {
    id: 'scan-1',
    shortCode: 'ABC123',
    joinToken: 'tok',
    createdAt: '2026-05-07T00:00:00.000Z',
    ...partial,
  }
}

function makeSession(partial: Partial<TracerBulletSession> = {}): TracerBulletSession {
  return {
    id: 'session-1',
    scanId: 'scan-1',
    userId: 'user-1',
    startedAt: '2026-05-07T00:00:00.000Z',
    clockOffsetMs: 0,
    status: 'completed',
    ...partial,
  }
}

function makeRecord(partial: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    recordId: 'record-1',
    sessionId: 'session-1',
    scanId: 'scan-1',
    userId: 'user-1',
    index: 0,
    capturedAt: '2026-05-07T00:00:00.000Z',
    capturedAtMonotonic: 0,
    zupt: true,
    image: {
      blobRef: 'record-1',
      thumbnailBlobRef: 'record-1',
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
      thumbnailWidth: 192,
      thumbnailHeight: 108,
      sizeBytes: 4,
      thumbnailSizeBytes: 4,
      sourceApi: 'ImageCapture',
    },
    camera: {},
    qualityChecks: {
      laplacianVariance: 50,
      overexposedFraction: 0,
      underexposedFraction: 0,
      steadyAtCapture: true,
      tiltDegrees: 0,
    },
    uploadState: 'pending',
    uploadAttempts: 0,
    ...partial,
  }
}

const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const THUMB_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

let dbSeq = 0
async function freshDb(): Promise<ShelfwalkDatabase> {
  return openShelfwalkDb(`test-assemble-${++dbSeq}`)
}

describe('assembleBundle', () => {
  it('returns error when scan is not found', async () => {
    const db = await freshDb()
    const result = await assembleBundle({ db, scanId: 'nonexistent', appVersion: '0.1.0' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/scan/i)
  })

  it('returns error when image blob is missing for a record', async () => {
    const db = await freshDb()
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    const record = makeRecord()
    await db.put('records', record, record.recordId)
    await db.put('thumbnails', new Blob([THUMB_BYTES], { type: 'image/png' }), record.recordId)

    const result = await assembleBundle({ db, scanId: 'scan-1', appVersion: '0.1.0' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/image|blob/i)
  })

  it('returns error when thumbnail blob is missing for a record', async () => {
    const db = await freshDb()
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    const record = makeRecord()
    await db.put('records', record, record.recordId)
    await db.put('blobs', new Blob([IMAGE_BYTES], { type: 'image/jpeg' }), record.recordId)

    const result = await assembleBundle({ db, scanId: 'scan-1', appVersion: '0.1.0' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/thumbnail/i)
  })

  describe('successful one-record bundle', () => {
    let db: ShelfwalkDatabase
    let result: Awaited<ReturnType<typeof assembleBundle>>

    beforeEach(async () => {
      db = await freshDb()
      const imageBlob = new Blob([IMAGE_BYTES], { type: 'image/jpeg' })
      const thumbBlob = new Blob([THUMB_BYTES], { type: 'image/jpeg' })
      await putScan(db, makeScan())
      await putSession(db, makeSession())
      await saveCapture(db, { record: makeRecord(), imageBlob, thumbnailBlob: thumbBlob })
      result = await assembleBundle({ db, scanId: 'scan-1', appVersion: '0.1.0' })
    })

    it('returns ok: true', () => {
      expect(result.ok).toBe(true)
    })

    it('manifest has correct top-level fields', () => {
      if (!result.ok) return
      const { manifest } = result
      expect(manifest.formatVersion).toBe(1)
      expect(manifest.appVersion).toBe('0.1.0')
      expect(manifest.scanId).toBe('scan-1')
      expect(manifest.sessionIds).toEqual(['session-1'])
      expect(manifest.recordCount).toBe(1)
      expect(manifest.sessionCount).toBe(1)
    })

    it('filename ends with .mbibundle.zip', () => {
      if (!result.ok) return
      expect(result.filename).toMatch(/\.mbibundle\.zip$/)
    })

    it('zip contains required files', async () => {
      if (!result.ok) return
      const zip = await JSZip.loadAsync(result.blob)
      expect(zip.file('manifest.json')).not.toBeNull()
      expect(zip.file('scan.json')).not.toBeNull()
      expect(zip.file('sessions/session-1.json')).not.toBeNull()
      expect(zip.file('records/session-1/record-1.json')).not.toBeNull()
      expect(zip.file('images/session-1/record-1.jpg')).not.toBeNull()
      expect(zip.file('thumbnails/session-1/record-1.jpg')).not.toBeNull()
    })

    it('manifest.json in zip parses as BundleManifest', async () => {
      if (!result.ok) return
      const zip = await JSZip.loadAsync(result.blob)
      const raw = await zip.file('manifest.json')!.async('string')
      const parsed: BundleManifest = JSON.parse(raw)
      expect(parsed.scanId).toBe('scan-1')
      expect(parsed.files.length).toBeGreaterThan(0)
    })

    it('manifest sha256 entries match actual file contents', async () => {
      if (!result.ok) return
      const zip = await JSZip.loadAsync(result.blob)
      for (const entry of result.manifest.files) {
        const zipFile = zip.file(entry.path)
        expect(zipFile).not.toBeNull()
        const data = await zipFile!.async('arraybuffer')
        const hashBuf = await crypto.subtle.digest('SHA-256', data)
        const hex = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        expect(hex).toBe(entry.sha256)
      }
    })

    it('totalBytes equals sum of file entry sizes', () => {
      if (!result.ok) return
      const { manifest } = result
      const sum = manifest.files.reduce((acc, f) => acc + f.sizeBytes, 0)
      expect(manifest.totalBytes).toBe(sum)
    })

    it('does not delete source blobs from IDB', async () => {
      if (!result.ok) return
      const blob = await loadBlob(db, 'record-1')
      const thumb = await loadThumbnail(db, 'record-1')
      expect(blob).not.toBeUndefined()
      expect(thumb).not.toBeUndefined()
    })

    it('does not promote upload state', async () => {
      if (!result.ok) return
      const record = await db.get('records', 'record-1')
      expect(record?.uploadState).toBe('pending')
    })
  })

  it('succeeds without a trace (trace is optional)', async () => {
    const db = await freshDb()
    const imageBlob = new Blob([IMAGE_BYTES], { type: 'image/jpeg' })
    const thumbBlob = new Blob([THUMB_BYTES], { type: 'image/jpeg' })
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await saveCapture(db, { record: makeRecord(), imageBlob, thumbnailBlob: thumbBlob })
    // No trace stored

    const result = await assembleBundle({ db, scanId: 'scan-1', appVersion: '0.1.0' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const traceEntry = result.manifest.files.find((f) => f.logicalType === 'trace')
    expect(traceEntry).toBeUndefined()
  })

  it('blocks export when storage headroom is below estimated archive size plus safety margin', async () => {
    const db = await freshDb()
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await saveCapture(db, {
      record: makeRecord(),
      imageBlob: new Blob([IMAGE_BYTES], { type: 'image/jpeg' }),
      thumbnailBlob: new Blob([THUMB_BYTES], { type: 'image/jpeg' }),
    })

    const result = await assembleBundle({
      db,
      scanId: 'scan-1',
      appVersion: '0.1.0',
      storage: { estimate: vi.fn().mockResolvedValue({ usage: 999, quota: 1000 }) },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/storage|space|headroom/i)
    const state = await getSessionBundleDeliveryState(db, 'session-1')
    expect(state).toMatchObject({ status: 'failed' })
    expect(await loadBlob(db, 'record-1')).not.toBeUndefined()
  })

  it('records aborted export state and allows retry', async () => {
    const db = await freshDb()
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await saveCapture(db, {
      record: makeRecord(),
      imageBlob: new Blob([IMAGE_BYTES], { type: 'image/jpeg' }),
      thumbnailBlob: new Blob([THUMB_BYTES], { type: 'image/jpeg' }),
    })
    const controller = new AbortController()
    controller.abort()

    const aborted = await assembleBundle({ db, scanId: 'scan-1', appVersion: '0.1.0', signal: controller.signal })
    expect(aborted.ok).toBe(false)
    if (!aborted.ok) expect(aborted.error).toMatch(/abort/i)
    expect(await getSessionBundleDeliveryState(db, 'session-1')).toMatchObject({ status: 'aborted' })

    const retry = await assembleBundle({ db, scanId: 'scan-1', appVersion: '0.1.0' })
    expect(retry.ok).toBe(true)
    expect(await getSessionBundleDeliveryState(db, 'session-1')).toMatchObject({ status: 'exported' })
  })

  it('does not mark corrupted generated archive as exported', async () => {
    const db = await freshDb()
    await putScan(db, makeScan())
    await putSession(db, makeSession())
    await saveCapture(db, {
      record: makeRecord(),
      imageBlob: new Blob([IMAGE_BYTES], { type: 'image/jpeg' }),
      thumbnailBlob: new Blob([THUMB_BYTES], { type: 'image/jpeg' }),
    })

    const result = await assembleBundle({
      db,
      scanId: 'scan-1',
      appVersion: '0.1.0',
      afterArchiveGenerated: async (blob) => {
        const zip = await JSZip.loadAsync(blob)
        zip.remove('images/session-1/record-1.jpg')
        return zip.generateAsync({ type: 'blob' })
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/missing file|archive/i)
    expect(await getSessionBundleDeliveryState(db, 'session-1')).toMatchObject({ status: 'failed' })
  })
})
