import type { CaptureImageResult } from '../camera/captureImage'
import { createCaptureRecord } from './capture'
import type { CaptureRecord } from './capture'
import { saveCapture } from './persistence'
import type { ShelfwalkDatabase } from './persistence'
import { qualityWarnings, runQualityChecks } from './qualityChecks'
import type { QualityWarning } from './qualityChecks'

const MAX_THUMB_EDGE = 640

export type ShutterContext = {
  sessionId: string
  scanId: string
  userId: string
  captureIndex: number
}

export type ShutterSensorState = {
  steady: boolean
  tiltDegrees: number
}

export type ShutterDeps = {
  db: ShelfwalkDatabase
  captureImage: () => Promise<CaptureImageResult>
  makeThumbnail: (blob: Blob) => Promise<Blob>
  getImageData: (blob: Blob) => Promise<ImageData>
  now: () => number
  monotonic: () => number
  generateId: () => string
}

export type ShutterResult = {
  record: CaptureRecord
  warnings: QualityWarning[]
}

export async function shutter(
  ctx: ShutterContext,
  sensor: ShutterSensorState,
  deps: ShutterDeps
): Promise<ShutterResult> {
  const { blob, width, height, sourceApi } = await deps.captureImage()

  const [thumbnailBlob, imageData] = await Promise.all([
    deps.makeThumbnail(blob),
    deps.getImageData(blob),
  ])

  const checks = runQualityChecks(imageData, { steady: sensor.steady, tiltDegrees: sensor.tiltDegrees })
  const warnings = qualityWarnings(checks)

  const scale = Math.min(MAX_THUMB_EDGE / width, MAX_THUMB_EDGE / height, 1)
  const thumbnailWidth = Math.max(1, Math.round(width * scale))
  const thumbnailHeight = Math.max(1, Math.round(height * scale))

  const record = createCaptureRecord(
    {
      sessionId: ctx.sessionId,
      scanId: ctx.scanId,
      userId: ctx.userId,
      index: ctx.captureIndex,
      image: {
        size: blob.size,
        thumbnailSize: thumbnailBlob.size,
        mimeType: blob.type || 'image/jpeg',
        width,
        height,
        thumbnailWidth,
        thumbnailHeight,
        sourceApi,
      },
      qualityChecks: checks,
    },
    { now: deps.now, monotonic: deps.monotonic, generateId: deps.generateId }
  )

  await saveCapture(deps.db, { record, imageBlob: blob, thumbnailBlob })

  return { record, warnings }
}
