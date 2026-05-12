import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaptureView } from './CaptureView'
import type { CaptureSnapshotResult } from './CaptureView'
import type { BootstrapResult } from './bootstrap'
import type { AccelerometerLike } from '../sensors/imuRecorder'
import { DebugLogger } from '../debug/logger'
import * as persistence from './persistence'

const MOCK_SNAPSHOT: CaptureSnapshotResult = {
  imageBlob: new Blob(['img'], { type: 'image/jpeg' }),
  thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
  width: 1280,
  height: 720,
}
const mockCaptureSnapshot = vi.fn().mockResolvedValue(MOCK_SNAPSHOT)

const storage = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
}

let mockGetUserMedia: ReturnType<typeof vi.fn>
let container: HTMLDivElement

beforeEach(() => {
  storage.clear()
  mockGetUserMedia = vi.fn()
  mockCaptureSnapshot.mockClear()
  mockCaptureSnapshot.mockResolvedValue(MOCK_SNAPSHOT)

  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    configurable: true,
  })

  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

function makeFakeStream(): MediaStream {
  const fakeTrack = {
    getSettings: () => ({ deviceId: 'fake-device', facingMode: 'environment' }),
    stop: () => {},
  } as unknown as MediaStreamTrack
  return {
    getTracks: () => [fakeTrack],
    getVideoTracks: () => [fakeTrack],
  } as unknown as MediaStream
}

function mockUploadFetch(status: number) {
  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Pick<Response, 'ok' | 'status'>> =>
    ({ ok: status >= 200 && status < 300, status })
}

function mockStorageManager(usage: number, quota: number, persisted = true) {
  return {
    persist: vi.fn().mockResolvedValue(persisted),
    estimate: vi.fn().mockResolvedValue({ usage, quota }),
  }
}

describe('CaptureView — bootstrap', () => {
  it('renders camera onboarding state', () => {
    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200) })
    expect(screen.getByText(/point your camera at a bookshelf/i)).toBeInTheDocument()
  })

  it('shows Open camera button after successful bootstrap', async () => {
    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200) })
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument()
    })
  })

  it('re-triggers bootstrap when Retry is clicked from error state', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    const user = userEvent.setup()

    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200) })
    await vi.waitFor(() => screen.getByRole('button', { name: /retry/i }))

    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    await user.click(screen.getByRole('button', { name: /retry/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument()
    })
  })
})

describe('CaptureView — camera permission', () => {
  it('shows Take photo button when camera permission is granted', async () => {
    const fakeStream = makeFakeStream()
    mockGetUserMedia.mockResolvedValue(fakeStream)
    const user = userEvent.setup()

    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200) })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument()
    })
  })

  it('shows a recovery message when camera permission is denied', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    const user = userEvent.setup()

    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200) })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/camera denied/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /take photo/i })).not.toBeInTheDocument()
  })

  it('keeps Open camera button visible after denial so the user can retry', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    const user = userEvent.setup()

    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200) })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))

    await vi.waitFor(() => screen.getByText(/camera denied/i))
    expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument()
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeAccel(): AccelerometerLike & {
  triggerReading(x: number, y: number, z: number, t: number): void
} {
  const sensor = {
    x: 0 as number | null,
    y: 0 as number | null,
    z: 0 as number | null,
    timestamp: 0 as DOMHighResTimeStamp | null,
    onreading: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: { error: DOMException }) => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
    triggerReading(x: number, y: number, z: number, t: number) {
      sensor.x = x; sensor.y = y; sensor.z = z; sensor.timestamp = t
      sensor.onreading?.(new Event('reading'))
    },
  }
  return sensor
}

// jsdom lacks ImageData constructor without the 'canvas' package — use a compatible POJO.
function makeImageDataPojo(width: number, height: number, fill: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4).fill(fill)
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

function makeBlurryImageData(): ImageData {
  // Uniform gray → near-zero laplacian variance → "blurry"
  return makeImageDataPojo(4, 4, 128)
}

function makeBrightImageData(): ImageData {
  // All white → overexposed
  return makeImageDataPojo(4, 4, 255)
}

// ── Steadiness gate ───────────────────────────────────────────────────────────

describe('CaptureView — steadiness gate', () => {
  async function grantCamera() {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()
    const accel = makeFakeAccel()

    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      accel,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    return { user, accel }
  }

  it('disables shutter button when accelerometer readings are shaky', async () => {
    const { accel } = await grantCamera()

    // Two samples 100ms apart with alternating ±3 m/s² on z → variance > 0.5
    accel.triggerReading(0, 0, 3, 0)
    accel.triggerReading(0, 0, -3, 100)
    accel.triggerReading(0, 0, 3, 200)

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /take photo/i })).toBeDisabled()
    })
  })

  it('enables shutter button when device is steady', async () => {
    const { accel } = await grantCamera()

    // Fill 200ms window with near-constant readings → variance ≈ 0
    for (let i = 0; i <= 200; i += 50) {
      accel.triggerReading(0.05, 0.05, 0.05, i)
    }

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /take photo/i })).not.toBeDisabled()
    })
  })

  it('shows a steadiness indicator when camera is active', async () => {
    await grantCamera()
    expect(screen.getByRole('status', { name: /steadiness/i })).toBeInTheDocument()
  })
})

// ── Quality warnings ──────────────────────────────────────────────────────────

describe('CaptureView — quality warnings', () => {
  let activeView: CaptureView | null = null

  afterEach(() => {
    activeView?.destroy()
    activeView = null
  })

  async function grantCameraWithQuality(getQualityFrame: () => ImageData | null) {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()

    activeView = new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      getQualityFrame,
      pollIntervalMs: 0,  // fire immediately
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    return user
  }

  it('shows blur warning when quality frame is uniformly gray', async () => {
    await grantCameraWithQuality(() => makeBlurryImageData())

    await vi.waitFor(() => {
      expect(screen.getByText(/blurry/i)).toBeInTheDocument()
    })
  })

  it('shows overexposed warning when quality frame is all white', async () => {
    await grantCameraWithQuality(() => makeBrightImageData())

    await vi.waitFor(() => {
      expect(screen.getByText(/overexposed/i)).toBeInTheDocument()
    })
  })

  it('shows no warnings when quality frame is null', async () => {
    await grantCameraWithQuality(() => null)

    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    expect(screen.queryByText(/blurry/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/overexposed/i)).not.toBeInTheDocument()
  })
})

// ── Capture and upload ────────────────────────────────────────────────────────

describe('CaptureView — capture and upload', () => {
  async function bootstrapAndGrantCamera(uploadFetch: ReturnType<typeof mockUploadFetch>) {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()

    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    return user
  }

  it('shows saved locally status when upload fails', async () => {
    const user = await bootstrapAndGrantCamera(mockUploadFetch(503))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/saved locally/i)).toBeInTheDocument()
    })
  })

  it('shows saved confirmation after successful upload', async () => {
    const user = await bootstrapAndGrantCamera(mockUploadFetch(200))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument()
    })
  })

  it('shows a persistent warning when storage persistence is denied', async () => {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const storageManager = mockStorageManager(0, 1024 * 1024 * 1024, false)

    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      storageManager,
    })

    await vi.waitFor(() => {
      expect(screen.getByText(/not protected from eviction/i)).toBeInTheDocument()
    })
    expect(storageManager.persist).toHaveBeenCalledTimes(1)
  })

  it('keeps the persistence-denied warning visible after later quota checks pass', async () => {
    const storageManager = mockStorageManager(0, 1024 * 1024 * 1024, false)
    const user = userEvent.setup()
    mockGetUserMedia.mockResolvedValue(makeFakeStream())

    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      storageManager,
    })
    await vi.waitFor(() => screen.getByText(/not protected from eviction/i))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/not protected from eviction/i)).toBeInTheDocument()
    })
  })

  it('blocks capture when quota is exhausted mid-session', async () => {
    const storageManager = mockStorageManager(0, 1024 * 1024 * 1024, true)
    const user = userEvent.setup()
    mockGetUserMedia.mockResolvedValue(makeFakeStream())

    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      storageManager,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))

    storageManager.estimate.mockResolvedValue({ usage: 1024, quota: 1024 })
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/storage is full/i)).toBeInTheDocument()
    })
    expect(mockCaptureSnapshot).not.toHaveBeenCalled()
  })

  it('shows upload failed status on non-2xx response', async () => {
    const user = await bootstrapAndGrantCamera(mockUploadFetch(503))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => {
      expect(screen.getByText(/saved locally/i)).toBeInTheDocument()
    })
  })
})

describe('CaptureView — ghost capture gate', () => {
  let activeView: CaptureView | null = null

  afterEach(() => {
    activeView?.destroy()
    activeView = null
  })

  async function bootstrapWithDebugLogger() {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()
    const logger = new DebugLogger(new URLSearchParams('debug'))
    const createImageBitmap = vi.fn().mockResolvedValue({ close: vi.fn() } as unknown as ImageBitmap)
    const view = new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      logger,
      createImageBitmap,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    activeView = view
    return { user, logger, view, createImageBitmap }
  }

  function setGhostState(view: CaptureView, ghost: { shiftPx: number; shiftPy: number; visible: boolean; workingDistanceCm: number }) {
    ;(view as any).ghostOverlay = {
      getDebugState: () => ({ ...ghost, rotShiftPx: ghost.shiftPx, rotShiftPy: ghost.shiftPy, transShiftPx: 0, transShiftPy: 0, yawIntegral: 0, pitchIntegral: 0, dx_cm: 0, dy_cm: 0, velX: 0, velY: 0, displayWidth: 414, displayHeight: 851 }),
      setSnapshot: vi.fn(),
      destroy: vi.fn(),
    }
  }

  function debugEvents(logger: DebugLogger) {
    return JSON.parse(logger.export()).events as Array<{ type: string; payload: Record<string, unknown> }>
  }

  it('blocks capture when the ghost is hidden after the first reference frame', async () => {
    const saveSpy = vi.spyOn(persistence, 'saveCapture')
    const { user, logger, view } = await bootstrapWithDebugLogger()
    ;(view as any).captureIndex = 1
    setGhostState(view, { shiftPx: 4, shiftPy: 1, visible: false, workingDistanceCm: 60 })

    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => expect(screen.getByText(/wait for the ghost overlay to reappear/i)).toBeInTheDocument())
    expect(saveSpy).not.toHaveBeenCalled()
    expect(debugEvents(logger).find((e) => e.type === 'capture:blocked')?.payload.reason).toBe('hidden')
    saveSpy.mockRestore()
  })

  it('blocks capture when horizontal ghost error exceeds the threshold', async () => {
    const saveSpy = vi.spyOn(persistence, 'saveCapture')
    const { user, logger, view } = await bootstrapWithDebugLogger()
    ;(view as any).captureIndex = 1
    setGhostState(view, { shiftPx: 41, shiftPy: 2, visible: true, workingDistanceCm: 60 })

    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => expect(screen.getByText(/recenter the ghost overlay/i)).toBeInTheDocument())
    expect(saveSpy).not.toHaveBeenCalled()
    expect(debugEvents(logger).find((e) => e.type === 'capture:blocked')?.payload.reason).toBe('large-horizontal-error')
    saveSpy.mockRestore()
  })

  it('blocks capture when recent accepted shifts oscillate left-right-left-right', async () => {
    const saveSpy = vi.spyOn(persistence, 'saveCapture')
    const { user, logger, view } = await bootstrapWithDebugLogger()
    ;(view as any).captureIndex = 4
    ;(view as any).recentAcceptedGhostShiftXs = [35, -38, 33]
    setGhostState(view, { shiftPx: -24, shiftPy: 1, visible: true, workingDistanceCm: 60 })

    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => expect(screen.getByText(/advance steadily in one direction/i)).toBeInTheDocument())
    expect(saveSpy).not.toHaveBeenCalled()
    expect(debugEvents(logger).find((e) => e.type === 'capture:blocked')?.payload.reason).toBe('oscillation')
    saveSpy.mockRestore()
  })

  it('allows centered captures and records the accepted shift history', async () => {
    const saveSpy = vi.spyOn(persistence, 'saveCapture')
    const { user, logger, view } = await bootstrapWithDebugLogger()
    ;(view as any).captureIndex = 2
    ;(view as any).recentAcceptedGhostShiftXs = [18]
    setGhostState(view, { shiftPx: 6, shiftPy: -2, visible: true, workingDistanceCm: 60 })

    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect((view as any).recentAcceptedGhostShiftXs).toEqual([18, 6]))
    const evaluateEvent = debugEvents(logger).find((e) => e.type === 'capture:evaluate')
    expect(evaluateEvent?.payload.allowed).toBe(true)
    expect(evaluateEvent?.payload.reason).toBeNull()
    saveSpy.mockRestore()
  })
})

// ── Thumbnail dimensions ──────────────────────────────────────────────────────

describe('CaptureView — thumbnail dimensions', () => {
  it('scales thumbnail dimensions to 640px long-edge (1280×720 → 640×360)', async () => {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()

    const saveSpy = vi.spyOn(persistence, 'saveCapture')

    mockCaptureSnapshot.mockResolvedValueOnce({
      imageBlob: new Blob(['img'], { type: 'image/jpeg' }),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
      width: 1280,
      height: 720,
    } satisfies CaptureSnapshotResult)

    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200) })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled())
    const { record } = saveSpy.mock.calls[0][1]
    expect(record.image.thumbnailWidth).toBe(640)
    expect(record.image.thumbnailHeight).toBe(360)

    saveSpy.mockRestore()
  })
})

// ── Debug mode ───────────────────────────────────────────────────────────────

describe('CaptureView — debug mode', () => {
  it('does not render an export logs button when debug mode is disabled', () => {
    new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200) })
    expect(screen.queryByRole('button', { name: /export logs/i })).not.toBeInTheDocument()
  })
})

describe('CaptureView — debug mode (enabled)', () => {
  let logger: DebugLogger
  let view: CaptureView | null = null

  beforeEach(() => {
    logger = new DebugLogger(new URLSearchParams('debug'))
  })

  afterEach(() => {
    view?.destroy()
    view = null
  })

  it('renders Export logs button when logger is enabled', () => {
    view = new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200), logger })
    expect(screen.getByRole('button', { name: /export logs/i })).toBeInTheDocument()
  })

  it('emits share:api-check on construction', () => {
    view = new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200), logger })
    const { events } = JSON.parse(logger.export()) as { events: Array<{ type: string }> }
    expect(events.some((e) => e.type === 'share:api-check')).toBe(true)
  })

  it('removes Export logs button on destroy()', () => {
    view = new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200), logger })
    expect(screen.getByRole('button', { name: /export logs/i })).toBeInTheDocument()
    view.destroy()
    expect(screen.queryByRole('button', { name: /export logs/i })).not.toBeInTheDocument()
  })

  it('registers and cleans up visibilitychange listener on destroy()', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    view = new CaptureView(container, { captureSnapshot: mockCaptureSnapshot, uploadFetch: mockUploadFetch(200), logger })
    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    view.destroy()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})

// ── Displacement tracking ────────────────────────────────────────────────────

describe('CaptureView — displacement tracking', () => {
  it('displacementMeters is undefined for the first capture (no prior monotonic time)', async () => {
    const saveSpy = vi.spyOn(persistence, 'saveCapture')
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()

    const fakeSlice = vi.fn().mockReturnValue([])
    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      getImuSlice: fakeSlice,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled())
    const { record } = saveSpy.mock.calls[0][1]
    expect(record.qualityChecks?.displacementMeters).toBeUndefined()
    expect(fakeSlice).not.toHaveBeenCalled()
    saveSpy.mockRestore()
  })

  it('displacementMeters is set for the second capture when getImuSlice is provided', async () => {
    const saveSpy = vi.spyOn(persistence, 'saveCapture')
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()

    const fakeSlice = vi.fn().mockReturnValue([
      { t: 0, ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0, qx: 0, qy: 0, qz: 0, qw: 1, grx: 0, gry: 0, grz: 9.81 },
      { t: 100, ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0, qx: 0, qy: 0, qz: 0, qw: 1, grx: 0, gry: 0, grz: 9.81 },
    ])
    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      getImuSlice: fakeSlice,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))

    // First capture — establishes prevCapturedAtMonotonic
    await user.click(screen.getByRole('button', { name: /take photo/i }))
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /take photo/i })).not.toBeDisabled())

    // Second capture — should compute displacement
    await user.click(screen.getByRole('button', { name: /take photo/i }))
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2))

    const { record } = saveSpy.mock.calls[1][1]
    expect(record.qualityChecks?.displacementMeters).toBeDefined()
    expect(fakeSlice).toHaveBeenCalled()
    saveSpy.mockRestore()
  })
})

// ── Tilt sanity warning ───────────────────────────────────────────────────────

describe('CaptureView — tilt sanity warning (spec: add-distance-config)', () => {
  afterEach(() => { vi.useRealTimers() })

  function fireOrientation(beta: number) {
    const ev = new Event('deviceorientation')
    Object.defineProperty(ev, 'beta', { value: beta })
    window.dispatchEvent(ev)
  }

  it('GIVEN camera open and phone tilted >30° off vertical for >1s THEN tilt warning appears after first capture', async () => {
    vi.useFakeTimers()
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))

    // First capture (suppresses tilt warning before first capture)
    await user.click(screen.getByRole('button', { name: /take photo/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))

    // Fire deviceorientation with beta=50° (|50-90|=40° > 30°)
    fireOrientation(50)

    // No warning yet — debounce 1s
    expect(container.querySelector('[data-tilt-warning]')).toBeNull()

    // Advance 1.1s
    vi.advanceTimersByTime(1100)

    await vi.waitFor(() => {
      expect(container.querySelector('[data-tilt-warning]')).not.toBeNull()
    })
  })

  it('GIVEN phone tilted WHEN brought upright THEN tilt warning disappears', async () => {
    vi.useFakeTimers()
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    await user.click(screen.getByRole('button', { name: /take photo/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))

    // Tilt
    fireOrientation(50)
    vi.advanceTimersByTime(1100)
    await vi.waitFor(() => expect(container.querySelector('[data-tilt-warning]')).not.toBeNull())

    // Bring upright
    fireOrientation(88)
    await vi.waitFor(() => expect(container.querySelector('[data-tilt-warning]')).toBeNull())
  })
})

// ── Captures gallery ─────────────────────────────────────────────────────────

describe('CaptureView — captures gallery', () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>
  let SESSION_ID: string
  let fakeBootstrap: BootstrapResult

  beforeEach(() => {
    SESSION_ID = crypto.randomUUID()
    fakeBootstrap = {
      resumed: false,
      scan: { id: 'scan-1', shortCode: 'ABC', joinToken: 'tok', createdAt: '2026-01-01T00:00:00.000Z' },
      session: { id: SESSION_ID, scanId: 'scan-1', userId: 'user-1', startedAt: '2026-01-01T00:00:00.000Z', clockOffsetMs: 0, status: 'active' },
    }
    let n = 0
    mockCreateObjectURL = vi.fn().mockImplementation(() => `blob:mock-${++n}`)
    vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: vi.fn() })
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function bootstrapAndGrantCamera() {
    const user = userEvent.setup()
    new CaptureView(container, {
      bootstrapResult: fakeBootstrap,
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    return user
  }

  it('shows no gallery thumbnails before any capture', async () => {
    await bootstrapAndGrantCamera()
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.camera-gallery-thumb')).toHaveLength(0)
    })
  })

  it('shows one thumbnail after one capture', async () => {
    const user = await bootstrapAndGrantCamera()
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => {
      expect(container.querySelectorAll('.camera-gallery-thumb')).toHaveLength(1)
    })
  })

  it('shows two thumbnails after two captures', async () => {
    const user = await bootstrapAndGrantCamera()
    await user.click(screen.getByRole('button', { name: /take photo/i }))
    await vi.waitFor(() => expect(container.querySelectorAll('.camera-gallery-thumb')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => {
      expect(container.querySelectorAll('.camera-gallery-thumb')).toHaveLength(2)
    })
  })

  it('thumbnail images have accessible alt text', async () => {
    const user = await bootstrapAndGrantCamera()
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('img', { name: /capture 1/i })).toBeInTheDocument()
    })
  })
})

describe('CaptureView — working distance persistence', () => {
  const LS_KEY = 'miblioteca.workingDistanceCm'

  const fakeCtx = {
    clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
    canvas: { width: 320, height: 240 },
  }
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D)
  })

  const fakeGyro = { start: vi.fn(), stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }

  async function bootstrapWithGyro(opts: { gyro?: object; searchParams?: string } = {}) {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    if (opts.searchParams !== undefined) {
      Object.defineProperty(window, 'location', {
        value: { search: opts.searchParams },
        configurable: true,
      })
    }
    const user = userEvent.setup()
    const view = new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      gyro: (opts.gyro ?? fakeGyro) as never,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    return { user, view }
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: { search: '' }, configurable: true })
  })

  it('persists localStorage value when camera opens', async () => {
    storage.set(LS_KEY, '80')
    await bootstrapWithGyro()
    expect(storage.get(LS_KEY)).toBe('80')
  })

  it('URL param is session-only: does NOT write to localStorage', async () => {
    await bootstrapWithGyro({ searchParams: '?distance=75' })
    expect(storage.get(LS_KEY)).toBeUndefined()
  })

  it('localStorage value takes priority over URL param', async () => {
    storage.set(LS_KEY, '90')
    await bootstrapWithGyro({ searchParams: '?distance=75' })
    expect(storage.get(LS_KEY)).toBe('90')
  })

  it('non-numeric URL param falls back to default and does not persist', async () => {
    await bootstrapWithGyro({ searchParams: '?distance=abc' })
    expect(storage.get(LS_KEY)).toBeUndefined()
  })

  it('captures deviceorientation samples and passes them to the ghost overlay callback', async () => {
    const { view } = await bootstrapWithGyro()
    const ev = new Event('deviceorientation')
    Object.defineProperties(ev, {
      alpha: { value: 181, configurable: true },
      beta: { value: 89, configurable: true },
      gamma: { value: 2, configurable: true },
    })
    window.dispatchEvent(ev)

    expect((view as any).latestDeviceOrientation).toEqual({ alpha: 181, beta: 89, gamma: 2 })
    expect((view as any).ghostOverlay.pipeline.deps.getOrientation()).toEqual({ alpha: 181, beta: 89, gamma: 2 })
    expect((view as any).ghostOverlay.pipeline.deps.getBeta()).toBe(89)
  })
})

describe('CaptureView — iOS InputFileCapture fallback', () => {
  beforeEach(() => {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
  })

  it('shows a Take photo button (file input trigger) on iOS when ImageCapture is absent', async () => {
    const user = userEvent.setup()
    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      useInputFileCapture: true,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument()
    })
  })

  it('renders a hidden file input with capture=environment when ImageCapture is absent', async () => {
    const user = userEvent.setup()
    new CaptureView(container, {
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: mockUploadFetch(200),
      useInputFileCapture: true,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))

    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    const fileInput = container.querySelector('input[type="file"][capture="environment"]')
    expect(fileInput).not.toBeNull()
  })
})
