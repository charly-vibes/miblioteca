import { describe, it, expect, vi } from 'vitest'
import { initCamera } from './cameraInit'
import type { CameraInitDeps, ImageCaptureConstructor, PhotoCapabilities } from './cameraInit'

function makeTrack(overrides: Partial<MediaTrackSettings> = {}): MediaStreamTrack {
  return {
    getSettings: () => ({ deviceId: 'cam-1', facingMode: 'environment', ...overrides }),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack
}

function makeStream(track = makeTrack()): MediaStream {
  return { getVideoTracks: () => [track] } as unknown as MediaStream
}

function makeImageCapture(caps: Partial<PhotoCapabilities> = {}): ImageCaptureConstructor {
  const instance = {
    getPhotoCapabilities: vi.fn().mockResolvedValue({
      imageWidth: { min: 640, max: 4096, step: 1 },
      imageHeight: { min: 480, max: 3072, step: 1 },
      ...caps,
    }),
  }
  return vi.fn(() => instance) as unknown as ImageCaptureConstructor
}

function makeDeps(overrides: Partial<CameraInitDeps> = {}): CameraInitDeps {
  return {
    getUserMedia: vi.fn().mockResolvedValue(makeStream()),
    ImageCapture: makeImageCapture(),
    ...overrides,
  }
}

describe('initCamera — happy path', () => {
  it('returns ok:true with stream on success', async () => {
    const stream = makeStream()
    const deps = makeDeps({ getUserMedia: vi.fn().mockResolvedValue(stream) })
    const result = await initCamera(deps)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.stream).toBe(stream)
  })

  it('requests environment-facing camera as ideal constraint', async () => {
    const deps = makeDeps()
    await initCamera(deps)
    expect(deps.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
    })
  })

  it('reads deviceId and facingMode from track settings', async () => {
    const track = makeTrack({ deviceId: 'rear-cam', facingMode: 'environment' })
    const deps = makeDeps({ getUserMedia: vi.fn().mockResolvedValue(makeStream(track)) })
    const result = await initCamera(deps)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities.deviceId).toBe('rear-cam')
      expect(result.capabilities.facingMode).toBe('environment')
    }
  })

  it('calls getPhotoCapabilities on the first video track', async () => {
    const ImageCaptureMock = makeImageCapture()
    const deps = makeDeps({ ImageCapture: ImageCaptureMock })
    const result = await initCamera(deps)
    expect(ImageCaptureMock).toHaveBeenCalled()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.capabilities.photoCapabilities).not.toBeNull()
  })

  it('includes track settings in capabilities', async () => {
    const track = makeTrack({ width: 1280, height: 720 })
    const deps = makeDeps({ getUserMedia: vi.fn().mockResolvedValue(makeStream(track)) })
    const result = await initCamera(deps)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities.settings).toMatchObject({ width: 1280, height: 720 })
    }
  })
})

describe('initCamera — capabilities probe degradation', () => {
  it('returns photoCapabilities: null when ImageCapture is not provided', async () => {
    const deps = makeDeps({ ImageCapture: undefined })
    const result = await initCamera(deps)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.capabilities.photoCapabilities).toBeNull()
  })

  it('returns photoCapabilities: null when getPhotoCapabilities() throws', async () => {
    const ImageCaptureMock = vi.fn(() => ({
      getPhotoCapabilities: vi.fn().mockRejectedValue(new DOMException('not supported')),
    })) as unknown as ImageCaptureConstructor
    const deps = makeDeps({ ImageCapture: ImageCaptureMock })
    const result = await initCamera(deps)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.capabilities.photoCapabilities).toBeNull()
  })
})

describe('initCamera — error paths', () => {
  it('returns permission-denied on NotAllowedError', async () => {
    const deps = makeDeps({
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
    })
    const result = await initCamera(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('permission-denied')
  })

  it('returns device-not-found on NotFoundError', async () => {
    const deps = makeDeps({
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('no cam', 'NotFoundError')),
    })
    const result = await initCamera(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('device-not-found')
  })

  it('returns device-not-found on DevicesNotFoundError', async () => {
    const deps = makeDeps({
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('no cam', 'DevicesNotFoundError')),
    })
    const result = await initCamera(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('device-not-found')
  })

  it('returns hardware-busy on NotReadableError', async () => {
    const deps = makeDeps({
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('in use', 'NotReadableError')),
    })
    const result = await initCamera(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('hardware-busy')
  })

  it('returns permission-denied on SecurityError (HTTPS/iframe)', async () => {
    const deps = makeDeps({
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('insecure', 'SecurityError')),
    })
    const result = await initCamera(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('permission-denied')
  })

  it('returns device-not-found when stream has no video tracks', async () => {
    const emptyStream = { getVideoTracks: () => [] } as unknown as MediaStream
    const deps = makeDeps({ getUserMedia: vi.fn().mockResolvedValue(emptyStream) })
    const result = await initCamera(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('device-not-found')
  })

  it('returns unknown on unexpected errors', async () => {
    const deps = makeDeps({
      getUserMedia: vi.fn().mockRejectedValue(new Error('something weird')),
    })
    const result = await initCamera(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unknown')
  })
})
