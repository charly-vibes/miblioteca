export type BundleFileLogicalType =
  | 'image'
  | 'thumbnail'
  | 'record-sidecar'
  | 'trace'
  | 'preview-frames'
  | 'manifest'
  | 'scan-metadata'
  | 'session-metadata'

export type BundleFileEntry = {
  path: string
  mimeType: string
  logicalType: BundleFileLogicalType
  sizeBytes: number
  sha256: string
}

export type BundleManifest = {
  formatVersion: 1
  appVersion: string
  scanId: string
  sessionIds: string[]
  exportedAt: string
  recordCount: number
  sessionCount: number
  totalBytes: number
  files: BundleFileEntry[]
}

export type BundleExportState =
  | { status: 'exported'; bundleFilename: string; exportedAt: string; sizeBytes: number; sha256: string }
  | { status: 'failed'; error: string }
  | { status: 'aborted' }

export type SessionBundleDeliveryState =
  | { status: 'idle' }
  | { status: 'in_progress' }
  | { status: 'exported'; bundleFilename: string; exportedAt: string; sizeBytes: number; sha256: string }
  | { status: 'failed'; error: string }
  | { status: 'aborted' }
