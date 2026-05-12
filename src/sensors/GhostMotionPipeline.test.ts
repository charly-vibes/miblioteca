import { describe, it, expect, vi } from 'vitest'
import { GhostMotionPipeline } from './GhostMotionPipeline'
import type { GhostMotionPipelineDeps } from './GhostMotionPipeline'
import type { GyroLike } from './ghostOverlay'

function makeGyro(): GyroLike & { fire(gx: number, gy: number, gz: number, t: number): void } {
  const g: GyroLike & { fire(gx: number, gy: number, gz: number, t: number): void } = {
    onreading: null,
    onerror: null,
    x: null, y: null, z: null,
    timestamp: null,
    start: vi.fn(),
    stop: vi.fn(),
    fire(gx, gy, gz, t) {
      this.x = gx; this.y = gy; this.z = gz; this.timestamp = t
      this.onreading?.()
    },
  }
  return g
}

function makeDeps(overrides: Partial<GhostMotionPipelineDeps> = {}): GhostMotionPipelineDeps & { raf: (cb: FrameRequestCallback) => number } {
  let pendingCb: FrameRequestCallback | null = null
  const raf = (cb: FrameRequestCallback) => { pendingCb = cb; return 1 }
  ;(raf as unknown as { flush(): void }).flush = () => { const cb = pendingCb; pendingCb = null; cb?.(performance.now()) }
  return {
    gyro: null,
    displayWidth: () => 800,
    displayHeight: () => 600,
    requestAnimationFrame: raf,
    ...overrides,
    raf,
  }
}

describe('GhostMotionPipeline', () => {
  describe('yaw integrates from gyro reading each RAF tick', () => {
    it('accumulates yaw from gyro y-axis (portrait) after RAF tick', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: false })
      const pipeline = new GhostMotionPipeline(deps)
      gyro.fire(0, 0.5, 0, 1000)  // gy=0.5 rad/s in portrait
      gyro.fire(0, 0.5, 0, 1100)  // dt=100ms → Δyaw = -(0.5 * 0.1) = -0.05
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame).toHaveBeenCalled()
      const frame = onFrame.mock.calls[0][0]
      expect(frame.yawRad).toBeCloseTo(-0.05, 5)
      pipeline.destroy()
    })
  })

  describe('pitch integrates from gyro reading each RAF tick', () => {
    it('accumulates pitch from gyro x-axis (portrait) after RAF tick', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: false })
      const pipeline = new GhostMotionPipeline(deps)
      gyro.fire(0.3, 0, 0, 1000)  // gx=0.3 rad/s
      gyro.fire(0.3, 0, 0, 1100)  // dt=100ms → Δpitch = 0.3 * 0.1 = 0.03
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame).toHaveBeenCalled()
      const frame = onFrame.mock.calls[0][0]
      expect(frame.pitchRad).toBeCloseTo(0.03, 5)
      pipeline.destroy()
    })
  })

  describe('yaw clamps at viewport left edge', () => {
    it('shiftPx does not exceed -displayWidth/2', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: false, displayWidth: () => 800 })
      const pipeline = new GhostMotionPipeline(deps)
      // Phone sweeps right → gy < 0 → yawIntegral grows positive → shiftPx negative (ghost left = left edge)
      for (let t = 1000; t <= 5000; t += 100) {
        gyro.fire(0, -2.0, 0, t)
      }
      ;(deps.raf as unknown as { flush(): void }).flush()
      const frame = onFrame.mock.calls[0][0]
      expect(frame.shiftPx).toBeGreaterThanOrEqual(-400)
      expect(frame.shiftPx).toBeLessThanOrEqual(0)
      pipeline.destroy()
    })
  })

  describe('yaw clamps at viewport right edge', () => {
    it('shiftPx does not exceed +displayWidth/2', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: false, displayWidth: () => 800 })
      const pipeline = new GhostMotionPipeline(deps)
      // Phone sweeps left → gy > 0 → yawIntegral grows negative → shiftPx positive (ghost right = right edge)
      for (let t = 1000; t <= 5000; t += 100) {
        gyro.fire(0, 2.0, 0, t)
      }
      ;(deps.raf as unknown as { flush(): void }).flush()
      const frame = onFrame.mock.calls[0][0]
      expect(frame.shiftPx).toBeLessThanOrEqual(400)
      expect(frame.shiftPx).toBeGreaterThanOrEqual(0)
      pipeline.destroy()
    })
  })

  describe('pitch clamps at viewport top/bottom edges', () => {
    it('pitchShiftPx does not exceed ±displayHeight/2', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: false, displayWidth: () => 800, displayHeight: () => 600 })
      const pipeline = new GhostMotionPipeline(deps)
      for (let t = 1000; t <= 5000; t += 100) {
        gyro.fire(3.0, 0, 0, t)  // large gx
      }
      ;(deps.raf as unknown as { flush(): void }).flush()
      const frame = onFrame.mock.calls[0][0]
      expect(Math.abs(frame.pitchShiftPx)).toBeLessThanOrEqual(300)
      pipeline.destroy()
    })
  })

  describe('enableMotionGate: true suppresses shift above motion threshold', () => {
    it('does not fire gated onFrame when omegaMag exceeds hide threshold (0.55)', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: true })
      const pipeline = new GhostMotionPipeline(deps)
      // omegaMag = sqrt(0.7^2) = 0.7 → above show threshold 0.40 → gate never opens
      gyro.fire(0, 0.7, 0, 1000)
      gyro.fire(0, 0.7, 0, 1100)
      ;(deps.raf as unknown as { flush(): void }).flush()
      const openFrames = onFrame.mock.calls.filter(([f]) => f.gateOpen)
      expect(openFrames).toHaveLength(0)
      pipeline.destroy()
    })
  })

  describe('enableMotionGate: false passes all motion through unfiltered', () => {
    it('fires onFrame even when motion is below threshold', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: false })
      const pipeline = new GhostMotionPipeline(deps)
      gyro.fire(0.01, 0.01, 0.01, 1000)
      gyro.fire(0.01, 0.01, 0.01, 1100)
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame).toHaveBeenCalled()
      expect(onFrame.mock.calls[0][0].gateOpen).toBe(true)
      pipeline.destroy()
    })
  })

  describe('reset() zeroes yaw and pitch integrals', () => {
    it('zeroes integrals after reset()', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: false })
      const pipeline = new GhostMotionPipeline(deps)
      gyro.fire(0, 0.5, 0, 1000)
      gyro.fire(0, 0.5, 0, 1100)
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame.mock.calls[0][0].yawRad).not.toBe(0)
      pipeline.reset()
      onFrame.mockClear()
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame.mock.calls[0][0].yawRad).toBe(0)
      expect(onFrame.mock.calls[0][0].pitchRad).toBe(0)
      pipeline.destroy()
    })
  })

  describe('onFrame fires with correct shiftPx and shiftPy', () => {
    it('reports shiftPx proportional to yaw', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: false, displayWidth: () => 800 })
      const pipeline = new GhostMotionPipeline(deps)
      gyro.fire(0, 0.5, 0, 1000)
      gyro.fire(0, 0.5, 0, 1100)  // yaw = -0.05 rad
      ;(deps.raf as unknown as { flush(): void }).flush()
      const frame = onFrame.mock.calls[0][0]
      // shiftPx = -focalLengthPx(800) * (-0.05) = positive
      expect(frame.shiftPx).toBeGreaterThan(0)
      expect(frame.shiftPx).toBeLessThan(400)
      pipeline.destroy()
    })
  })

  describe('scanAxis follows getOrientation() result', () => {
    it('uses gx for yaw in landscape orientation', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({
        gyro, onFrame, enableMotionGate: false,
        getOrientation: () => 'landscape-primary',
      })
      const pipeline = new GhostMotionPipeline(deps)
      // In landscape, gx is yaw axis. Fire gx=0.5, gy=0 → should see yaw accumulate
      gyro.fire(0.5, 0, 0, 1000)
      gyro.fire(0.5, 0, 0, 1100)  // dt=0.1 → yaw = -(0.5 * 0.1) = -0.05
      ;(deps.raf as unknown as { flush(): void }).flush()
      const frame = onFrame.mock.calls[0][0]
      expect(frame.yawRad).toBeCloseTo(-0.05, 5)
      pipeline.destroy()
    })

    it('uses gy for yaw in portrait orientation (default)', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({
        gyro, onFrame, enableMotionGate: false,
        getOrientation: () => 'portrait-primary',
      })
      const pipeline = new GhostMotionPipeline(deps)
      gyro.fire(0, 0.5, 0, 1000)
      gyro.fire(0, 0.5, 0, 1100)
      ;(deps.raf as unknown as { flush(): void }).flush()
      const frame = onFrame.mock.calls[0][0]
      expect(frame.yawRad).toBeCloseTo(-0.05, 5)
      pipeline.destroy()
    })
  })

  describe('destroy() cleanup', () => {
    it('stops the gyro and nulls onreading on destroy', () => {
      const gyro = makeGyro()
      const deps = makeDeps({ gyro, enableMotionGate: false })
      const pipeline = new GhostMotionPipeline(deps)
      pipeline.destroy()
      expect(gyro.stop).toHaveBeenCalled()
      expect(gyro.onreading).toBeNull()
    })
  })

  describe('gate close preserves yawIntegral for correct position on reopen', () => {
    it('ghost position since capture is not lost when gate closes during fast pan', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: true })
      const pipeline = new GhostMotionPipeline(deps)

      // Step 1: slow motion — gate opens, accumulate yaw
      // gy=0.3 rad/s (< showThreshold 0.40) for 0.1s → dYaw = -0.03
      gyro.fire(0, 0.3, 0, 1000)  // first sample, no dt yet
      gyro.fire(0, 0.3, 0, 1100)  // dt=0.1 → dYaw=-0.03
      ;(deps.raf as unknown as { flush(): void }).flush()
      const openFrame = onFrame.mock.calls.at(-1)?.[0]
      expect(openFrame?.gateOpen).toBe(true)
      onFrame.mockClear()

      // Step 2: fast pan — gate closes
      // gy=0.7 (> hideThreshold 0.55), dt=0.1 → dYaw=-0.07 → total yaw=-0.10
      gyro.fire(0, 0.7, 0, 1200)
      ;(deps.raf as unknown as { flush(): void }).flush()
      const closeFrame = onFrame.mock.calls.at(-1)?.[0]
      expect(closeFrame?.gateOpen).toBe(false)
      onFrame.mockClear()

      // Step 3: slow motion resumes — gate reopens
      // gy=0.3, dt=0.1 → dYaw=-0.03 → total yaw should be -0.13 (not -0.03)
      gyro.fire(0, 0.3, 0, 1300)
      ;(deps.raf as unknown as { flush(): void }).flush()
      const reopenFrame = onFrame.mock.calls.at(-1)?.[0]
      expect(reopenFrame?.gateOpen).toBe(true)
      // yawRad should reflect all motion since capture: -0.03 + -0.07 + -0.03 = -0.13
      // With current (broken) code, yawIntegral resets on gate close → only -0.03 from step 3
      expect(reopenFrame?.yawRad).toBeCloseTo(-0.13, 2)

      pipeline.destroy()
    })
  })

  describe('gate close hard-zeros velX/velY (ZUPT spec)', () => {
    it('velX and velY are 0 in internal state immediately after gate closes', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: true })
      const pipeline = new GhostMotionPipeline(deps)

      // Manually inject non-zero velX/velY into the private state so the test
      // is not dependent on accel integration logic.
      const pAny = pipeline as unknown as { state: { velX: number; velY: number; [k: string]: unknown } }
      pAny.state = { ...pAny.state, velX: 1.5, velY: -0.8 }

      // Step 1: slow motion → gate opens
      gyro.fire(0, 0.1, 0, 1000)
      gyro.fire(0, 0.1, 0, 1100)
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame.mock.calls.at(-1)?.[0].gateOpen).toBe(true)

      // Step 2: fast pan → gate closes
      onFrame.mockClear()
      gyro.fire(0, 1.0, 0, 1200)
      gyro.fire(0, 1.0, 0, 1300)
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame.mock.calls.find(([f]) => f.gateOpen === false)).toBeTruthy()

      // Spec: velX and velY SHALL be hard-zeroed when gate closes
      expect(pAny.state.velX).toBe(0)
      expect(pAny.state.velY).toBe(0)

      pipeline.destroy()
    })
  })

  describe('no-gyro + enableMotionGate guard', () => {
    it('does not fire onFrame when gyro is null and enableMotionGate is true', () => {
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro: null, onFrame, enableMotionGate: true })
      const pipeline = new GhostMotionPipeline(deps)
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame).not.toHaveBeenCalled()
      pipeline.destroy()
    })

    it('fires onFrame when gyro is null and enableMotionGate is false', () => {
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro: null, onFrame, enableMotionGate: false })
      const pipeline = new GhostMotionPipeline(deps)
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame).toHaveBeenCalled()
      pipeline.destroy()
    })
  })
})

describe('gyro onerror handler (robustness spec mibilioteca-cf0)', () => {
  it('GIVEN gyro error fires THEN onerror is not null (should be a real handler)', () => {
    const gyro = makeGyro()
    const deps = makeDeps({ gyro, enableMotionGate: false })
    const pipeline = new GhostMotionPipeline(deps)

    // After construction the pipeline must NOT leave onerror as null —
    // it should wire a real handler so sensor errors don't crash silently.
    expect(gyro.onerror).not.toBeNull()

    pipeline.destroy()
  })
})
