import { describe, it, expect, vi } from 'vitest'
import { GhostMotionPipeline } from './GhostMotionPipeline'
import type { GhostMotionPipelineDeps } from './GhostMotionPipeline'
import type { GyroLike, OrientationLike } from './ghostOverlay'

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

  describe('scanAxis follows getScreenOrientation() result', () => {
    it('uses gx for yaw in landscape orientation', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({
        gyro, onFrame, enableMotionGate: false,
        getScreenOrientation: () => 'landscape-primary',
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
        getScreenOrientation: () => 'portrait-primary',
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

  describe('openGate() makes gate emitable; subsequent high-omegaMag suppresses again', () => {
    it('GIVEN gateVisible=false WHEN openGate() THEN low-omegaMag tick fires gateOpen=true', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: true })
      const pipeline = new GhostMotionPipeline(deps)
      // After construction gateVisible=false; without openGate the gate would never open
      // Call openGate() to simulate a new capture (e.g., setSnapshot in GhostOverlayCanvas)
      pipeline.openGate()

      // Low-omegaMag reading → should emit gateOpen=true frame
      gyro.fire(0, 0.1, 0, 1000)
      gyro.fire(0, 0.1, 0, 1100)
      ;(deps.raf as unknown as { flush(): void }).flush()
      const frame = onFrame.mock.calls.find(([f]) => f.gateOpen === true)
      expect(frame).toBeTruthy()
      pipeline.destroy()
    })

    it('GIVEN openGate() called WHEN high-omegaMag fires THEN gate closes (gateOpen=false)', () => {
      const gyro = makeGyro()
      const onFrame = vi.fn()
      const deps = makeDeps({ gyro, onFrame, enableMotionGate: true })
      const pipeline = new GhostMotionPipeline(deps)
      pipeline.openGate()

      // First open the gate with a low-omegaMag tick
      gyro.fire(0, 0.1, 0, 1000)
      gyro.fire(0, 0.1, 0, 1100)
      ;(deps.raf as unknown as { flush(): void }).flush()
      expect(onFrame.mock.calls.at(-1)?.[0].gateOpen).toBe(true)
      onFrame.mockClear()

      // Now spike omegaMag above hide threshold → gate must close
      gyro.fire(0, 2.0, 0, 1200)
      ;(deps.raf as unknown as { flush(): void }).flush()
      const closeFrame = onFrame.mock.calls.find(([f]) => f.gateOpen === false)
      expect(closeFrame).toBeTruthy()
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

describe('GhostMotionPipeline — onGyroSample hook', () => {
  it('onGyroSample is called after each gyro reading with current state', () => {
    const gyro = makeGyro()
    const onGyroSample = vi.fn()
    const pipeline = new GhostMotionPipeline({
      gyro,
      onGyroSample,
      displayWidth: () => 390,
      displayHeight: () => 844,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
      now: () => 100,
    })

    gyro.fire(0.2, 0, 0, 100)

    expect(onGyroSample).toHaveBeenCalledOnce()
    const state = onGyroSample.mock.calls[0][0]
    expect(typeof state.yawRad).toBe('number')
    expect(typeof state.pitchRad).toBe('number')

    pipeline.destroy()
  })

  it('pipeline works correctly when onGyroSample is not provided', () => {
    const gyro = makeGyro()
    expect(() => {
      const pipeline = new GhostMotionPipeline({
        gyro,
        displayWidth: () => 390,
        displayHeight: () => 844,
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: vi.fn(),
        now: () => 100,
      })
      gyro.fire(0, 0, 0, 100)
      pipeline.destroy()
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Absolute orientation path (DeviceOrientationEvent-based tracking)
// ---------------------------------------------------------------------------

function makeOrientation(): OrientationLike & { fire(alpha: number, beta: number, gamma: number): void } {
  const o: OrientationLike & { fire(alpha: number, beta: number, gamma: number): void } = {
    onreading: null,
    alpha: null, beta: null, gamma: null,
    start: vi.fn(),
    stop: vi.fn(),
    fire(a, b, g) {
      this.alpha = a; this.beta = b; this.gamma = g
      this.onreading?.()
    },
  }
  return o
}

describe('GhostMotionPipeline — absolute orientation', () => {
  it('uses orientation delta for yaw/pitch instead of gyro integration', () => {
    const gyro = makeGyro()
    const orientation = makeOrientation()
    const onFrame = vi.fn()
    const deps = makeDeps({ gyro, orientation, onFrame, enableMotionGate: false })
    const pipeline = new GhostMotionPipeline(deps)

    // First orientation reading sets reference
    orientation.fire(180, 90, 0)
    // Gyro fires but should only update omegaMag, not yaw/pitch
    gyro.fire(0, 0.5, 0, 1000)
    gyro.fire(0, 0.5, 0, 1100)
    // Second orientation reading: 2° alpha change → ~2° yaw
    orientation.fire(182, 90, 0)

    ;(deps.raf as unknown as { flush(): void }).flush()
    const frame = onFrame.mock.calls[0][0]
    // Should reflect orientation delta (~0.02 rad for first frame due to rate limiter),
    // NOT gyro integration (which would give -0.05 rad)
    expect(frame.yawRad).toBeGreaterThan(0)
    expect(frame.yawRad).toBeLessThan(0.04)
    pipeline.destroy()
  })

  it('uses getOrientation callback when no orientation sensor is provided', () => {
    const gyro = makeGyro()
    let sample: { alpha: number; beta: number; gamma: number } | null = { alpha: 180, beta: 90, gamma: 0 }
    const onFrame = vi.fn()
    const deps = makeDeps({
      gyro,
      onFrame,
      enableMotionGate: false,
      getOrientation: () => sample,
    })
    const pipeline = new GhostMotionPipeline(deps)

    gyro.fire(0, 0, 0, 1000)
    ;(deps.raf as unknown as { flush(): void }).flush()
    sample = { alpha: 182, beta: 90, gamma: 0 }
    gyro.fire(0, 0, 0, 1100)
    ;(deps.raf as unknown as { flush(): void }).flush()

    const frame = onFrame.mock.calls.at(-1)![0]
    expect(frame.yawRad).toBeGreaterThan(0)
    expect(frame.yawRad).toBeLessThan(0.04)
    pipeline.destroy()
  })

  it('gyro still provides omegaMag for motion gate when orientation is active', () => {
    const gyro = makeGyro()
    const orientation = makeOrientation()
    const onFrame = vi.fn()
    const deps = makeDeps({ gyro, orientation, onFrame, enableMotionGate: true })
    const pipeline = new GhostMotionPipeline(deps)

    orientation.fire(180, 90, 0)
    // High gyro → omegaMag above threshold → gate should close
    gyro.fire(0, 2.0, 0, 1000)
    gyro.fire(0, 2.0, 0, 1100)
    orientation.fire(182, 90, 0)
    ;(deps.raf as unknown as { flush(): void }).flush()
    const openFrames = onFrame.mock.calls.filter(([f]) => f.gateOpen)
    expect(openFrames).toHaveLength(0)
    pipeline.destroy()
  })

  it('falls back to gyro integration when orientation is not provided', () => {
    const gyro = makeGyro()
    const onFrame = vi.fn()
    const deps = makeDeps({ gyro, onFrame, enableMotionGate: false })
    const pipeline = new GhostMotionPipeline(deps)

    gyro.fire(0, 0.5, 0, 1000)
    gyro.fire(0, 0.5, 0, 1100)
    ;(deps.raf as unknown as { flush(): void }).flush()
    const frame = onFrame.mock.calls[0][0]
    // Gyro integration: yaw = -(0.5 * 0.1) = -0.05
    expect(frame.yawRad).toBeCloseTo(-0.05, 5)
    pipeline.destroy()
  })

  it('reset() makes next orientation reading the new reference', () => {
    const gyro = makeGyro()
    const orientation = makeOrientation()
    const onFrame = vi.fn()
    const deps = makeDeps({ gyro, orientation, onFrame, enableMotionGate: false })
    const pipeline = new GhostMotionPipeline(deps)

    orientation.fire(180, 90, 0)
    orientation.fire(185, 90, 0)
    gyro.fire(0, 0, 0, 1000)
    ;(deps.raf as unknown as { flush(): void }).flush()
    expect(onFrame.mock.calls[0][0].yawRad).toBeGreaterThan(0)

    pipeline.reset()
    onFrame.mockClear()
    // New reference at 185°
    orientation.fire(185, 90, 0)
    // Same angle as new reference → yaw should be 0
    orientation.fire(185, 90, 0)
    gyro.fire(0, 0, 0, 1200)
    ;(deps.raf as unknown as { flush(): void }).flush()
    expect(onFrame.mock.calls[0][0].yawRad).toBeCloseTo(0, 4)
    pipeline.destroy()
  })

  it('destroy() stops orientation sensor', () => {
    const gyro = makeGyro()
    const orientation = makeOrientation()
    const deps = makeDeps({ gyro, orientation, enableMotionGate: false })
    const pipeline = new GhostMotionPipeline(deps)
    pipeline.destroy()
    expect(orientation.stop).toHaveBeenCalled()
    expect(orientation.onreading).toBeNull()
  })

  it('orientation noise on a still device produces shifts within capture gate', () => {
    const gyro = makeGyro()
    const orientation = makeOrientation()
    const onFrame = vi.fn()
    let nowMs = 0
    const deps = makeDeps({
      gyro, orientation, onFrame, enableMotionGate: false,
      displayWidth: () => 414, displayHeight: () => 896,
      now: () => nowMs,
    })
    const pipeline = new GhostMotionPipeline(deps)

    orientation.fire(180, 90, 0)
    const rng = (seed: number) => Math.abs(Math.sin(seed * 12.9898 + 78.233) * 43758.5453 % 1)
    for (let i = 1; i <= 120; i++) {
      nowMs = i * 16
      const jitter = (rng(i) - 0.5) * 4
      gyro.fire(0, 0, 0, nowMs)
      orientation.fire(180 + jitter, 90 + (rng(i + 1000) - 0.5) * 4, (rng(i + 2000) - 0.5) * 4)
      ;(deps.raf as unknown as { flush(): void }).flush()
    }

    const lastFrame = onFrame.mock.calls.at(-1)?.[0]
    expect(lastFrame).toBeDefined()
    expect(Math.abs(lastFrame!.shiftPx)).toBeLessThan(40)
    pipeline.destroy()
  })

  it('skips orientation reading when alpha/beta/gamma are null', () => {
    const gyro = makeGyro()
    const orientation = makeOrientation()
    const onFrame = vi.fn()
    const deps = makeDeps({ gyro, orientation, onFrame, enableMotionGate: false })
    const pipeline = new GhostMotionPipeline(deps)

    // Fire with null values — should not initialize orientation state
    orientation.alpha = null; orientation.beta = null; orientation.gamma = null
    orientation.onreading?.()

    // Gyro should still integrate (fallback path since orientation not initialized)
    gyro.fire(0, 0.5, 0, 1000)
    gyro.fire(0, 0.5, 0, 1100)
    ;(deps.raf as unknown as { flush(): void }).flush()
    const frame = onFrame.mock.calls[0][0]
    expect(frame.yawRad).toBeCloseTo(-0.05, 5)
    pipeline.destroy()
  })
})
