import { describe, it, expect } from 'vitest'
import type {
  BundleManifest,
  BundleFileEntry,
  BundleExportState,
  SessionBundleDeliveryState,
  BundleTransferGuidance,
  BundleShareCapability,
} from './types'
import type { CaptureRecord } from '../tracer'

describe('BundleFileEntry', () => {
  it('has required shape', () => {
    const entry: BundleFileEntry = {
      path: 'images/session-1/rec-abc.jpg',
      mimeType: 'image/jpeg',
      logicalType: 'image',
      sizeBytes: 102400,
      sha256: 'abc123',
    }
    expect(entry.path).toBe('images/session-1/rec-abc.jpg')
    expect(entry.sha256).toBe('abc123')
  })
})

describe('BundleManifest', () => {
  it('has required shape including per-file entries', () => {
    const manifest: BundleManifest = {
      formatVersion: 1,
      appVersion: '0.1.0',
      scanId: 'scan-1',
      sessionIds: ['session-1'],
      exportedAt: '2026-05-07T00:00:00.000Z',
      recordCount: 1,
      sessionCount: 1,
      totalBytes: 204800,
      files: [
        {
          path: 'images/session-1/rec-abc.jpg',
          mimeType: 'image/jpeg',
          logicalType: 'image',
          sizeBytes: 102400,
          sha256: 'abc123',
        },
      ],
    }
    expect(manifest.formatVersion).toBe(1)
    expect(manifest.files).toHaveLength(1)
  })
})

describe('BundleExportState', () => {
  it('exported state includes bundle metadata', () => {
    const state: BundleExportState = {
      status: 'exported',
      bundleFilename: 'my-library_abc123_2026-05-07.mbibundle.zip',
      exportedAt: '2026-05-07T00:00:00.000Z',
      sizeBytes: 204800,
      sha256: 'def456',
    }
    expect(state.status).toBe('exported')
    expect(state.bundleFilename).toContain('.mbibundle.zip')
  })

  it('failed state carries a recoverable error', () => {
    const state: BundleExportState = {
      status: 'failed',
      error: 'Missing blob for rec-abc',
    }
    expect(state.status).toBe('failed')
  })

  it('aborted state has no error required', () => {
    const state: BundleExportState = { status: 'aborted' }
    expect(state.status).toBe('aborted')
  })
})

describe('SessionBundleDeliveryState', () => {
  it('is separate from uploadState', () => {
    // CaptureRecord.uploadState is still present and unchanged
    const uploadState: CaptureRecord['uploadState'] = 'pending'
    // SessionBundleDeliveryState tracks bundle export, not upload
    const deliveryState: SessionBundleDeliveryState = { status: 'idle' }
    expect(uploadState).toBe('pending')
    expect(deliveryState.status).toBe('idle')
  })

  it('in_progress state has no bundle yet', () => {
    const state: SessionBundleDeliveryState = { status: 'in_progress' }
    expect(state.status).toBe('in_progress')
  })
})

describe('transfer guidance and share capability', () => {
  it('models large-bundle transfer guidance', () => {
    const guidance: BundleTransferGuidance = {
      level: 'recommend-drive-or-usb',
      message: 'Use Drive or USB for very large bundles.',
      thresholdBytes: 500 * 1024 * 1024,
      recompressWarning: '',
    }

    expect(guidance.level).toBe('recommend-drive-or-usb')
  })

  it('models unsupported file sharing as a download fallback', () => {
    const capability: BundleShareCapability = {
      status: 'unsupported',
      reason: 'file-share-unavailable',
      fallback: 'download',
    }

    expect(capability.fallback).toBe('download')
  })
})
