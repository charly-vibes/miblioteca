import { beforeEach, describe, expect, it } from 'vitest'
import { loadBlob, loadCaptureRecord, loadThumbnail, openShelfwalkDb } from './persistence'
import { shutter, type ShutterContext, type ShutterDeps, type ShutterSensorState } from './shutter'
import type { ShelfwalkDatabase } from './persistence'

const IMAGE_BLOB = new Blob(['fake-jpeg-data'], { type: 'image/jpeg' })
const THUMB_BLOB = new Blob(['fake-thumb-data'], { type: 'image/jpeg' })

function makeImageData(luma = 128, size = 4): ImageData {
  const d = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = luma; d[i + 1] = luma; d[i + 2] = luma; d[i + 3] = 255
  }
  return { data: d, width: size, height: size, colorSpace: 'srgb' } as unknown as ImageData
}

function makeCheckerboardImageData(size = 10): ImageData {
  const d = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < d.length; i += 4) {
    const luma = (i / 4) % 2 === 0 ? 100 : 155
    d[i] = luma; d[i + 1] = luma; d[i + 2] = luma; d[i + 3] = 255
  }
  return { data: d, width: size, height: size, colorSpace: 'srgb' } as unknown as ImageData
}

const BASE_CTX: ShutterContext = {
  sessionId: 'session-1',
  scanId: 'scan-1',
  userId: 'user-1',
  captureIndex: 0,
}

const STEADY_SENSOR: ShutterSensorState = { steady: true, tiltDegrees: 2 }

function makeDeps(
  db: ShelfwalkDatabase,
  overrides: Partial<ShutterDeps> = {}
): ShutterDeps {
  return {
    db,
    captureImage: async () => ({ blob: IMAGE_BLOB, width: 3024, height: 4032, sourceApi: 'CanvasSnapshot' }),
    makeThumbnail: async () => THUMB_BLOB,
    getImageData: async () => makeImageData(128),
    now: () => 1_000_000,
    monotonic: () => 42,
    generateId: () => 'record-id-1',
    ...overrides,
  }
}

describe('shutter', () => {
  let db: ShelfwalkDatabase

  beforeEach(async () => {
    db = await openShelfwalkDb(`test-shutter-${Math.random()}`)
  })

  it('saves the CaptureRecord to IDB with uploadState=pending', async () => {
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, makeDeps(db))
    const saved = await loadCaptureRecord(db, record.recordId)
    expect(saved?.uploadState).toBe('pending')
  })

  it('saves the image blob to IDB and records its size', async () => {
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, makeDeps(db))
    // jsdom structured-clone strips Blob to {}; verify presence via the store key and record metadata
    const blob = await loadBlob(db, record.recordId)
    expect(blob).toBeDefined()
    expect(record.image.sizeBytes).toBe(IMAGE_BLOB.size)
    expect(record.image.mimeType).toBe(IMAGE_BLOB.type)
  })

  it('saves the thumbnail blob to IDB and records its size', async () => {
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, makeDeps(db))
    // jsdom structured-clone strips Blob to {}; verify presence via the store key and record metadata
    const thumb = await loadThumbnail(db, record.recordId)
    expect(thumb).toBeDefined()
    expect(record.image.thumbnailSizeBytes).toBe(THUMB_BLOB.size)
  })

  it('populates qualityChecks.steadyAtCapture from sensor state', async () => {
    const { record: steady } = await shutter(BASE_CTX, STEADY_SENSOR, makeDeps(db))
    expect(steady.qualityChecks.steadyAtCapture).toBe(true)

    const db2 = await openShelfwalkDb(`test-shutter-${Math.random()}`)
    const { record: unsteady } = await shutter(
      { ...BASE_CTX, captureIndex: 1 },
      { steady: false, tiltDegrees: 0 },
      makeDeps(db2)
    )
    expect(unsteady.qualityChecks.steadyAtCapture).toBe(false)
  })

  it('populates qualityChecks.tiltDegrees from sensor state', async () => {
    const { record } = await shutter(BASE_CTX, { steady: true, tiltDegrees: 7.5 }, makeDeps(db))
    expect(record.qualityChecks.tiltDegrees).toBe(7.5)
  })

  it('computes laplacianVariance via getImageData', async () => {
    const deps = makeDeps(db, { getImageData: async () => makeCheckerboardImageData(10) })
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, deps)
    expect(record.qualityChecks.laplacianVariance).toBeGreaterThan(0)
  })

  it('returns quality warnings for underexposed frame', async () => {
    const deps = makeDeps(db, { getImageData: async () => makeImageData(1) })
    const { warnings } = await shutter(BASE_CTX, STEADY_SENSOR, deps)
    expect(warnings).toContain('underexposed')
  })

  it('returns quality warnings for overexposed frame', async () => {
    const deps = makeDeps(db, { getImageData: async () => makeImageData(255) })
    const { warnings } = await shutter(BASE_CTX, STEADY_SENSOR, deps)
    expect(warnings).toContain('overexposed')
  })

  it('returns no exposure warnings for a mid-luma frame', async () => {
    const { warnings } = await shutter(BASE_CTX, STEADY_SENSOR, makeDeps(db))
    expect(warnings).not.toContain('overexposed')
    expect(warnings).not.toContain('underexposed')
  })

  it('copies session/scan/user/index onto the record', async () => {
    const ctx: ShutterContext = { sessionId: 's1', scanId: 'sc1', userId: 'u1', captureIndex: 5 }
    const { record } = await shutter(ctx, STEADY_SENSOR, makeDeps(db))
    expect(record.sessionId).toBe('s1')
    expect(record.scanId).toBe('sc1')
    expect(record.userId).toBe('u1')
    expect(record.index).toBe(5)
  })

  it('propagates captureImage sourceApi onto the record', async () => {
    const deps = makeDeps(db, {
      captureImage: async () => ({ blob: IMAGE_BLOB, width: 1920, height: 1080, sourceApi: 'ImageCapture' }),
    })
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, deps)
    expect(record.image.sourceApi).toBe('ImageCapture')
  })

  it('computes thumbnail dimensions from image dimensions', async () => {
    const deps = makeDeps(db, {
      captureImage: async () => ({ blob: IMAGE_BLOB, width: 3024, height: 4032, sourceApi: 'CanvasSnapshot' }),
    })
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, deps)
    // scale = min(640/3024, 640/4032) = 640/4032 ≈ 0.1587
    expect(record.image.thumbnailWidth).toBe(480)
    expect(record.image.thumbnailHeight).toBe(640)
  })

  it('sets uploadAttempts to 0', async () => {
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, makeDeps(db))
    expect(record.uploadAttempts).toBe(0)
  })

  it('uses generateId, now, and monotonic from deps', async () => {
    const deps = makeDeps(db, {
      generateId: () => 'custom-id',
      now: () => 9_999_999,
      monotonic: () => 77.5,
    })
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, deps)
    expect(record.recordId).toBe('custom-id')
    expect(record.capturedAt).toBe(new Date(9_999_999).toISOString())
    expect(record.capturedAtMonotonic).toBe(77.5)
  })

  it('stores displacementMeters when getImuSlice and prevCapturedAtMonotonic are provided', async () => {
    const imuSamples = [
      { t: 0,  ax: 1, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, qx: 0, qy: 0, qz: 0, qw: 1, grx: 0, gry: 0, grz: 0 },
      { t: 10, ax: 1, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, qx: 0, qy: 0, qz: 0, qw: 1, grx: 0, gry: 0, grz: 0 },
    ]
    const deps = makeDeps(db, { getImuSlice: () => imuSamples })
    const ctx = { ...BASE_CTX, prevCapturedAtMonotonic: 30 }
    const { record } = await shutter(ctx, STEADY_SENSOR, deps)
    expect(record.qualityChecks.displacementMeters).toBeGreaterThan(0)
  })

  it('omits displacementMeters on first capture (no prevCapturedAtMonotonic)', async () => {
    const deps = makeDeps(db, { getImuSlice: () => [] })
    const { record } = await shutter(BASE_CTX, STEADY_SENSOR, deps)
    expect(record.qualityChecks.displacementMeters).toBeUndefined()
  })
})
