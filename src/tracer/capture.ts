export type CaptureRecord = {
  recordId: string
  sessionId: string
  scanId: string
  userId: string
  index: number
  capturedAt: string
  capturedAtMonotonic: number
  zupt: true
  isAnchorFrame?: boolean
  isTieShot?: boolean
  tiedToUserId?: string
  image: {
    blobRef: string
    thumbnailBlobRef: string
    mimeType: string
    width: number
    height: number
    thumbnailWidth: number
    thumbnailHeight: number
    sizeBytes: number
    thumbnailSizeBytes: number
    sourceApi: 'ImageCapture' | 'CanvasSnapshot' | 'InputFileCapture'
  }
  camera: {
    deviceId?: string
    facingMode?: 'environment' | 'user'
    settings?: Partial<MediaTrackSettings>
    capabilities?: Partial<MediaTrackCapabilities>
  }
  geolocation?: {
    lat: number; lon: number
    accuracyMeters: number
    altitudeMeters: number | null
    altitudeAccuracyMeters: number | null
    heading: number | null; speed: number | null
    timestamp: number
  }
  orientation?: {
    quaternion: [number, number, number, number]
    alpha: number; beta: number; gamma: number
    absolute: boolean; timestamp: number
  }
  motion?: {
    accel:       { x: number; y: number; z: number; timestamp: number }
    linearAccel: { x: number; y: number; z: number; timestamp: number }
    gyro:        { x: number; y: number; z: number; timestamp: number }
    gravity:     { x: number; y: number; z: number; timestamp: number }
  }
  motionWindow?: {
    samples: Array<{ t: number; ax: number; ay: number; az: number; gx: number; gy: number; gz: number }>
  }
  qualityChecks: {
    laplacianVariance: number
    overexposedFraction: number
    underexposedFraction: number
    steadyAtCapture: boolean
    tiltDegrees: number
    blurry: boolean
    overexposed: boolean
    underexposed: boolean
    dark: boolean
    estimatedYawDeltaSincePrev?: number
    displacementMeters?: number
  }
  exif?: Record<string, unknown>
  uploadState: 'pending' | 'uploading' | 'uploaded' | 'failed' | 'rejected'
  uploadAttempts: number
}

export type PreviewFrame = {
  timestamp: number
  orientation?: {
    alpha: number
    beta: number
    gamma: number
    absolute: boolean
  }
  linearAcceleration?: {
    x: number | null
    y: number | null
    z: number | null
  }
  tiltDegrees?: number
}

export type CaptureRecordInput = {
  sessionId: string
  scanId: string
  userId: string
  index: number
  image: {
    size: number
    thumbnailSize: number
    mimeType: string
    width: number
    height: number
    thumbnailWidth: number
    thumbnailHeight: number
    sourceApi: 'ImageCapture' | 'CanvasSnapshot' | 'InputFileCapture'
  }
  qualityChecks?: {
    laplacianVariance: number
    overexposedFraction: number
    underexposedFraction: number
    steadyAtCapture: boolean
    tiltDegrees: number
    blurry: boolean
    overexposed: boolean
    underexposed: boolean
    dark: boolean
    estimatedYawDeltaSincePrev?: number
    displacementMeters?: number
  }
}

type CaptureRecordDeps = {
  now: () => number
  monotonic: () => number
  generateId: () => string
}

const DEFAULT_QUALITY_CHECKS: CaptureRecord['qualityChecks'] = {
  laplacianVariance: 0,
  overexposedFraction: 0,
  underexposedFraction: 0,
  steadyAtCapture: true,
  tiltDegrees: 0,
  blurry: false,
  overexposed: false,
  underexposed: false,
  dark: false,
}

export function createCaptureRecord(
  input: CaptureRecordInput,
  deps: CaptureRecordDeps
): CaptureRecord {
  const recordId = deps.generateId()

  return {
    recordId,
    sessionId: input.sessionId,
    scanId: input.scanId,
    userId: input.userId,
    index: input.index,
    capturedAt: new Date(deps.now()).toISOString(),
    capturedAtMonotonic: deps.monotonic(),
    zupt: true,
    image: {
      blobRef: recordId,
      thumbnailBlobRef: recordId,
      mimeType: input.image.mimeType,
      width: input.image.width,
      height: input.image.height,
      thumbnailWidth: input.image.thumbnailWidth,
      thumbnailHeight: input.image.thumbnailHeight,
      sizeBytes: input.image.size,
      thumbnailSizeBytes: input.image.thumbnailSize,
      sourceApi: input.image.sourceApi,
    },
    camera: {},
    qualityChecks: { ...(input.qualityChecks ?? DEFAULT_QUALITY_CHECKS) },
    uploadState: 'pending',
    uploadAttempts: 0,
  }
}
