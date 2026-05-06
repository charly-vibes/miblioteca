import { describe, it, expect } from 'vitest'
import { createCaptureRecord, type CaptureRecordInput } from './capture'

const BASE_SESSION = {
  sessionId: 'session-abc',
  scanId: 'scan-xyz',
  userId: 'user-123',
}

const BASE_IMAGE: CaptureRecordInput['image'] = {
  size: 204800,
  thumbnailSize: 12288,
  mimeType: 'image/jpeg',
  width: 3024,
  height: 4032,
  thumbnailWidth: 480,
  thumbnailHeight: 640,
  sourceApi: 'CanvasSnapshot',
}

const BASE_DEPS = {
  now: () => 1746500000000,
  monotonic: () => 12345.67,
  generateId: () => 'record-uuid-1',
}

describe('createCaptureRecord', () => {
  it('produces a record with zupt: true', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.zupt).toBe(true)
  })

  it('sets uploadState to pending', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.uploadState).toBe('pending')
  })

  it('uses generateId for recordId', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.recordId).toBe('record-uuid-1')
  })

  it('denormalises session, scan, and user ids', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.sessionId).toBe('session-abc')
    expect(record.scanId).toBe('scan-xyz')
    expect(record.userId).toBe('user-123')
  })

  it('sets index from input', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 3, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.index).toBe(3)
  })

  it('derives capturedAt ISO string from now()', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.capturedAt).toBe(new Date(1746500000000).toISOString())
  })

  it('stores capturedAtMonotonic from monotonic()', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.capturedAtMonotonic).toBe(12345.67)
  })

  it('sets blobRef and thumbnailBlobRef to recordId', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.image.blobRef).toBe('record-uuid-1')
    expect(record.image.thumbnailBlobRef).toBe('record-uuid-1')
  })

  it('copies image metadata from input', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.image.mimeType).toBe('image/jpeg')
    expect(record.image.width).toBe(3024)
    expect(record.image.height).toBe(4032)
    expect(record.image.thumbnailWidth).toBe(480)
    expect(record.image.thumbnailHeight).toBe(640)
    expect(record.image.sizeBytes).toBe(204800)
    expect(record.image.thumbnailSizeBytes).toBe(12288)
    expect(record.image.sourceApi).toBe('CanvasSnapshot')
  })

  it('defaults qualityChecks to zero-baseline values', () => {
    const record = createCaptureRecord(
      { ...BASE_SESSION, index: 0, image: BASE_IMAGE },
      BASE_DEPS
    )
    expect(record.qualityChecks.laplacianVariance).toBe(0)
    expect(record.qualityChecks.overexposedFraction).toBe(0)
    expect(record.qualityChecks.underexposedFraction).toBe(0)
    expect(record.qualityChecks.steadyAtCapture).toBe(true)
    expect(record.qualityChecks.tiltDegrees).toBe(0)
  })

  it('qualityChecks objects are independent across records', () => {
    const make = () =>
      createCaptureRecord({ ...BASE_SESSION, index: 0, image: BASE_IMAGE }, BASE_DEPS)
    const a = make()
    const b = make()
    a.qualityChecks.laplacianVariance = 999
    expect(b.qualityChecks.laplacianVariance).toBe(0)
  })

  it('accepts optional qualityChecks overrides', () => {
    const record = createCaptureRecord(
      {
        ...BASE_SESSION,
        index: 0,
        image: BASE_IMAGE,
        qualityChecks: {
          laplacianVariance: 120,
          overexposedFraction: 0.01,
          underexposedFraction: 0.02,
          steadyAtCapture: true,
          tiltDegrees: 2.5,
        },
      },
      BASE_DEPS
    )
    expect(record.qualityChecks.laplacianVariance).toBe(120)
    expect(record.qualityChecks.tiltDegrees).toBe(2.5)
  })
})
