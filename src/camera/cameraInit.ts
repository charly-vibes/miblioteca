export interface MediaSettingsRange {
  min: number
  max: number
  step: number
}

export interface PhotoCapabilities {
  redEyeReduction?: string
  imageHeight?: MediaSettingsRange
  imageWidth?: MediaSettingsRange
  fillLightMode?: string[]
}

export interface ImageCaptureInstance {
  getPhotoCapabilities(): Promise<PhotoCapabilities>
}

export type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureInstance

export type CameraCapabilities = {
  deviceId: string
  facingMode: string | undefined
  settings: Partial<MediaTrackSettings>
  photoCapabilities: PhotoCapabilities | null
}

export type CameraInitSuccess = {
  ok: true
  stream: MediaStream
  capabilities: CameraCapabilities
}

export type CameraInitError = {
  ok: false
  error: 'permission-denied' | 'device-not-found' | 'hardware-busy' | 'unknown'
}

export type CameraInitResult = CameraInitSuccess | CameraInitError

export type CameraInitDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  ImageCapture?: ImageCaptureConstructor
}

import { debugLogger } from '../debug/logger'

export async function initCamera(deps: CameraInitDeps): Promise<CameraInitResult> {
  let stream: MediaStream
  try {
    stream = await deps.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        debugLogger.log('camera:init-result', { ok: false, error: 'permission-denied' })
        return { ok: false, error: 'permission-denied' }
      }
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        debugLogger.log('camera:init-result', { ok: false, error: 'device-not-found' })
        return { ok: false, error: 'device-not-found' }
      }
      if (error.name === 'NotReadableError') {
        debugLogger.log('camera:init-result', { ok: false, error: 'hardware-busy' })
        return { ok: false, error: 'hardware-busy' }
      }
    }
    debugLogger.log('camera:init-result', { ok: false, error: 'unknown' })
    return { ok: false, error: 'unknown' }
  }

  const track = stream.getVideoTracks()[0]
  if (!track) {
    debugLogger.log('camera:init-result', { ok: false, error: 'device-not-found' })
    return { ok: false, error: 'device-not-found' }
  }
  const settings = track.getSettings()
  const deviceId = settings.deviceId ?? ''
  const facingMode = settings.facingMode

  let photoCapabilities: PhotoCapabilities | null = null
  if (deps.ImageCapture) {
    try {
      const imageCapture = new deps.ImageCapture(track)
      photoCapabilities = await imageCapture.getPhotoCapabilities()
    } catch {
      // ImageCapture not supported on this device/browser — degrade to null
    }
  }

  debugLogger.log('camera:init-result', { ok: true, facingMode, deviceId })
  return {
    ok: true,
    stream,
    capabilities: { deviceId, facingMode, settings, photoCapabilities },
  }
}
