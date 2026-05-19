import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { debugLogger } from './logger'
import { initCamera } from '../camera/cameraInit'
import type { CameraInitDeps } from '../camera/cameraInit'
import { probeSensors } from '../sensors/probe'
import type { SensorProbeDeps } from '../sensors/probe'
import { GhostOverlayCanvas } from '../sensors/ghostOverlayCanvas'
import type { GyroLike } from '../sensors/ghostOverlayCanvas'
import { shareBundle, downloadBundle } from '../bundle/share'
import { CaptureView, type BootstrapResult } from '../tracer'

vi.mock('./logger', async (importActual) => {
  const actual = await importActual<typeof import('./logger')>()
  return {
    DebugLogger: actual.DebugLogger,
    debugLogger: new actual.DebugLogger(new URLSearchParams('debug')),
  }
})

function hasEvent(type: string): boolean {
  const { events } = JSON.parse(debugLogger.export()) as { events: Array<{ type: string; payload: unknown }> }
  return events.some((e) => e.type === type)
}

function hasEventWithPayload(type: string, predicate: (p: unknown) => boolean): boolean {
  const { events } = JSON.parse(debugLogger.export()) as { events: Array<{ type: string; payload: unknown }> }
  return events.some((e) => e.type === type && predicate(e.payload))
}

beforeEach(() => {
  debugLogger.clear()
})

// ── camera:init-result ───────────────────────────────────────────────────────

describe('camera:init-result', () => {
  it('logs camera:init-result on successful init', async () => {
    const track = {
      getSettings: () => ({ deviceId: 'cam-1', facingMode: 'environment' }),
    } as unknown as MediaStreamTrack
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream
    const deps: CameraInitDeps = { getUserMedia: vi.fn().mockResolvedValue(stream) }
    await initCamera(deps)
    expect(hasEventWithPayload('camera:init-result', (p) => {
      const payload = p as { ok: boolean; facingMode?: string; deviceId?: string }
      return payload.ok === true && payload.facingMode === 'environment' && payload.deviceId === 'cam-1'
    })).toBe(true)
  })
})

// ── sensor:probe-result + sensor:permission-result ───────────────────────────

describe('sensor:probe-result + sensor:permission-result', () => {
  it('logs sensor:probe-result with status=granted and via=generic-sensor when generic sensor is available', async () => {
    const deps: SensorProbeDeps = {
      hasAccelerometer: true,
      hasGyroscope: false,
      hasAbsoluteOrientationSensor: false,
      hasGravitySensor: false,
      hasDeviceMotionEvent: false,
    }
    await probeSensors(deps)
    expect(hasEventWithPayload('sensor:probe-result', (p) => {
      const payload = p as { status: string; via?: string }
      return payload.status === 'granted' && payload.via === 'generic-sensor'
    })).toBe(true)
  })

  it('logs sensor:permission-requested, sensor:permission-result, and sensor:probe-result on iOS permission path', async () => {
    const deps: SensorProbeDeps = {
      hasAccelerometer: false,
      hasGyroscope: false,
      hasAbsoluteOrientationSensor: false,
      hasGravitySensor: false,
      hasDeviceMotionEvent: false,
      requestMotionPermission: vi.fn().mockResolvedValue('granted'),
    }
    await probeSensors(deps)
    expect(hasEvent('sensor:permission-requested')).toBe(true)
    expect(hasEventWithPayload('sensor:permission-result', (p) => (p as { granted: boolean }).granted === true)).toBe(true)
    expect(hasEvent('sensor:probe-result')).toBe(true)
  })
})

// ── ghost overlay events ─────────────────────────────────────────────────────

describe('ghost overlay events', () => {
  let viewfinder: HTMLDivElement
  let overlay: GhostOverlayCanvas | null = null

  beforeEach(() => {
    viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    overlay?.destroy()
    overlay = null
    viewfinder.remove()
    vi.restoreAllMocks()
  })

  it('logs ghost:created on construction', () => {
    overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      requestAnimationFrame: vi.fn().mockReturnValue(0),
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    expect(hasEvent('ghost:created')).toBe(true)
  })

  it('logs ghost:destroyed on destroy()', () => {
    overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      requestAnimationFrame: vi.fn().mockReturnValue(0),
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    overlay.destroy()
    overlay = null
    expect(hasEvent('ghost:destroyed')).toBe(true)
  })

  it('logs ghost:render-tick on first RAF callback after snapshot is set', () => {
    let rafCb: FrameRequestCallback | null = null
    overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      requestAnimationFrame: (cb) => { rafCb = cb; return 0 },
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    overlay.setSnapshot({ width: 100, height: 100 } as unknown as ImageBitmap)
    ;(rafCb as unknown as FrameRequestCallback)(0)
    expect(hasEvent('ghost:render-tick')).toBe(true)
  })

  it('logs sensor:orientation-sample on first gyro reading', () => {
    const gyro: GyroLike = {
      onreading: null,
      onerror: null,
      x: 0.1, y: 0.2, z: 0.3,
      timestamp: 100 as DOMHighResTimeStamp,
      start: vi.fn(),
      stop: vi.fn(),
    }
    overlay = new GhostOverlayCanvas(viewfinder, {
      gyro,
      requestAnimationFrame: vi.fn().mockReturnValue(0),
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    gyro.onreading?.()
    expect(hasEvent('sensor:orientation-sample')).toBe(true)
  })

  it('logs ghost:reference-frame-set on setSnapshot()', () => {
    overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      requestAnimationFrame: vi.fn().mockReturnValue(0),
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    overlay.setSnapshot({ width: 100, height: 50 } as ImageBitmap)
    expect(hasEvent('ghost:reference-frame-set')).toBe(true)
  })
})

// ── share:api-check ──────────────────────────────────────────────────────────

describe('share:api-check', () => {
  let container: HTMLDivElement
  let view: CaptureView | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    })
  })

  afterEach(() => {
    view?.destroy()
    container.remove()
    view = null
  })

  it('logs share:api-check on CaptureView construction with debug logger', () => {
    view = new CaptureView(container, {
      captureSnapshot: vi.fn(),
      uploadFetch: async () => ({ ok: true, status: 200 }),
      logger: debugLogger,
    })
    expect(hasEvent('share:api-check')).toBe(true)
  })
})

// ── share:attempt + share:result + download:triggered ────────────────────────

describe('share and download events', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('logs share:attempt and share:result on successful shareBundle', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockResolvedValue(undefined) })
    const blob = new Blob(['data'])
    await shareBundle(blob, 'test.zip')
    expect(hasEventWithPayload('share:attempt', (p) => (p as { sizeBytes: number }).sizeBytes === blob.size)).toBe(true)
    expect(hasEventWithPayload('share:result', (p) => (p as { outcome: string }).outcome === 'success')).toBe(true)
  })

  it('logs download:triggered on downloadBundle', () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:test'),
      revokeObjectURL: vi.fn(),
    })
    const a = document.createElement('a')
    const clickSpy = vi.spyOn(a, 'click').mockImplementation(() => {
      // do nothing
    })
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(a)
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => a)
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => a)

    downloadBundle(new Blob(['data']), 'test.zip')

    expect(hasEvent('download:triggered')).toBe(true)
    expect(createSpy).toHaveBeenCalledWith('a')
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(appendSpy).toHaveBeenCalledWith(a)
    expect(removeSpy).toHaveBeenCalledWith(a)
  })
})

// ── capture:shutter + capture:saved ──────────────────────────────────────────

describe('capture:shutter + capture:saved', () => {
  let container: HTMLDivElement
  let view: CaptureView | null = null
  let mockGetUserMedia: ReturnType<typeof vi.fn>
  const mockCaptureSnapshot = vi.fn()

  const fakeBootstrap: BootstrapResult = {
    resumed: false,
    scan: { id: 'scan-1', shortCode: 'ABC', joinToken: 'tok', createdAt: '2026-01-01T00:00:00.000Z' },
    session: {
      id: 'session-integ-1',
      scanId: 'scan-1',
      userId: 'user-1',
      startedAt: '2026-01-01T00:00:00.000Z',
      clockOffsetMs: 0,
      status: 'active',
    },
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    mockGetUserMedia = vi.fn()
    mockCaptureSnapshot.mockClear()
    mockCaptureSnapshot.mockResolvedValue({
      imageBlob: new Blob(['img'], { type: 'image/jpeg' }),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
      width: 640,
      height: 480,
    })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true,
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    view?.destroy()
    container.remove()
    view = null
    vi.unstubAllGlobals()
  })

  function makeFakeStream(): MediaStream {
    const track = {
      getSettings: () => ({ deviceId: 'cam-1', facingMode: 'environment' }),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack
    return {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream
  }

  it('logs capture:shutter and capture:saved after take photo', async () => {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()
    view = new CaptureView(container, {
      bootstrapResult: fakeBootstrap,
      captureSnapshot: mockCaptureSnapshot,
      uploadFetch: async () => ({ ok: true, status: 200 }),
      logger: debugLogger,
    })
    await vi.waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await vi.waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    await user.click(screen.getByRole('button', { name: /take photo/i }))
    await vi.waitFor(() => {
      expect(hasEvent('capture:shutter')).toBe(true)
      expect(hasEvent('capture:saved')).toBe(true)
    })
  })
})
