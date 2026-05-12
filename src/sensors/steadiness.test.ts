import { describe, it, expect } from 'vitest'
import { feedAccel, initialSteadinessState, VARIANCE_THRESHOLD_DEFAULT } from './steadiness'

function makeSamples(
  count: number,
  baseT: number,
  intervalMs: number,
  ax: number,
  ay: number,
  az: number
) {
  return Array.from({ length: count }, (_, i) => ({
    t: baseT + i * intervalMs,
    ax,
    ay,
    az,
  }))
}

describe('initialSteadinessState', () => {
  it('starts steady with empty window', () => {
    const s = initialSteadinessState()
    expect(s.steady).toBe(true)
    expect(s.window).toHaveLength(0)
  })
})

describe('feedAccel — steady cases', () => {
  it('reports steady when all samples are near zero', () => {
    let state = initialSteadinessState()
    const samples = makeSamples(10, 0, 20, 0.01, 0.01, 0.01)
    for (const s of samples) state = feedAccel(state, s)
    expect(state.steady).toBe(true)
  })

  it('reports steady with fewer than 2 samples in window', () => {
    const state = feedAccel(initialSteadinessState(), { t: 0, ax: 5, ay: 5, az: 5 })
    expect(state.steady).toBe(true)
  })

  it('reports steady when all samples have identical values', () => {
    let state = initialSteadinessState()
    const samples = makeSamples(10, 0, 20, 1.0, 0.5, 0.2)
    for (const s of samples) state = feedAccel(state, s)
    expect(state.steady).toBe(true)
  })
})

describe('feedAccel — shaky cases', () => {
  it('reports not steady when linear acceleration alternates directions (high directional variance)', () => {
    let state = initialSteadinessState()
    // Alternating +5 / -5 on x — magnitude-only variance misses this, component variance catches it
    for (let i = 0; i < 10; i++) {
      state = feedAccel(state, { t: i * 20, ax: i % 2 === 0 ? 5 : -5, ay: 0, az: 0 })
    }
    expect(state.steady).toBe(false)
  })

  it('reports not steady with large magnitude swings', () => {
    let state = initialSteadinessState()
    for (let i = 0; i < 10; i++) {
      state = feedAccel(state, { t: i * 20, ax: i % 2 === 0 ? 8 : 0, ay: 0, az: 0 })
    }
    expect(state.steady).toBe(false)
  })

  it('respects a custom threshold', () => {
    let state = initialSteadinessState()
    const samples = makeSamples(10, 0, 20, 0.3, 0, 0)
    // With default threshold this would be steady; with threshold=0 it is not
    for (const s of samples) state = feedAccel(state, s, 0)
    expect(state.steady).toBe(false)
  })
})

describe('feedAccel — window pruning', () => {
  it('prunes samples older than 200ms', () => {
    let state = initialSteadinessState()
    const old = makeSamples(5, 0, 20, 0, 0, 0)
    for (const s of old) state = feedAccel(state, s)
    state = feedAccel(state, { t: 300, ax: 0, ay: 0, az: 0 })
    expect(state.window.every(s => s.t >= 300 - 200)).toBe(true)
  })

  it('keeps samples exactly at the 200ms boundary', () => {
    let state = initialSteadinessState()
    state = feedAccel(state, { t: 0, ax: 0, ay: 0, az: 0 })
    state = feedAccel(state, { t: 200, ax: 0, ay: 0, az: 0 })
    // >= is intentional: sample at exactly WINDOW_MS ago stays in window
    expect(state.window.some(s => s.t === 0)).toBe(true)
  })

  it('window contains only the new sample when gap exceeds 200ms', () => {
    let state = initialSteadinessState()
    state = feedAccel(state, { t: 0, ax: 1, ay: 1, az: 1 })
    state = feedAccel(state, { t: 500, ax: 1, ay: 1, az: 1 })
    expect(state.window).toHaveLength(1)
    expect(state.window[0].t).toBe(500)
  })

  it('recovers steady after shaky window is fully evicted (warm-up→eviction transition)', () => {
    let state = initialSteadinessState()
    // Feed shaky samples at t=0..180 (within 200ms window)
    for (let i = 0; i < 10; i++) {
      state = feedAccel(state, { t: i * 20, ax: i % 2 === 0 ? 5 : -5, ay: 0, az: 0 })
    }
    expect(state.steady).toBe(false)

    // Jump ahead 500ms so all old samples are evicted, then feed steady samples
    for (let i = 0; i < 10; i++) {
      state = feedAccel(state, { t: 500 + i * 20, ax: 0.01, ay: 0.01, az: 0.01 })
    }
    expect(state.steady).toBe(true)
  })
})

describe('feedAccel — robustness', () => {
  it('drops NaN samples and leaves state unchanged', () => {
    let state = initialSteadinessState()
    const good = makeSamples(5, 0, 20, 0, 0, 0)
    for (const s of good) state = feedAccel(state, s)
    const before = state

    state = feedAccel(state, { t: 100, ax: NaN, ay: 0, az: 0 })
    expect(state).toBe(before)
  })

  it('does not get permanently stuck at steady=false due to NaN', () => {
    let state = initialSteadinessState()
    const samples = makeSamples(10, 0, 20, 0.01, 0.01, 0.01)
    for (const s of samples) state = feedAccel(state, s)
    expect(state.steady).toBe(true)

    // A NaN sample should not affect steady
    state = feedAccel(state, { t: 200, ax: NaN, ay: NaN, az: NaN })
    expect(state.steady).toBe(true)
  })

  it('discards out-of-order samples and leaves state unchanged', () => {
    let state = initialSteadinessState()
    state = feedAccel(state, { t: 100, ax: 0, ay: 0, az: 0 })
    const before = state

    // t=50 arrives after t=100 — should be discarded
    state = feedAccel(state, { t: 50, ax: 5, ay: 5, az: 5 })
    expect(state).toBe(before)
  })

  it('tracks lastT correctly for monotonicity enforcement', () => {
    let state = initialSteadinessState()
    state = feedAccel(state, { t: 100, ax: 0, ay: 0, az: 0 })
    expect(state.lastT).toBe(100)
    state = feedAccel(state, { t: 120, ax: 0, ay: 0, az: 0 })
    expect(state.lastT).toBe(120)
  })

  it('drops duplicate-timestamp samples to prevent unbounded window growth', () => {
    let state = initialSteadinessState()
    state = feedAccel(state, { t: 100, ax: 0, ay: 0, az: 0 })
    const before = state
    // Same timestamp as lastT — should be treated as duplicate and discarded
    state = feedAccel(state, { t: 100, ax: 5, ay: 5, az: 5 })
    expect(state).toBe(before)
  })

  it('window stays bounded at max 200ms/16ms ≈ 13 samples under duplicate-timestamp spam', () => {
    let state = initialSteadinessState()
    // Feed 100 samples all at t=100 (all duplicates after the first)
    state = feedAccel(state, { t: 100, ax: 0, ay: 0, az: 0 })
    for (let i = 0; i < 99; i++) {
      state = feedAccel(state, { t: 100, ax: 0, ay: 0, az: 0 })
    }
    expect(state.window).toHaveLength(1)
  })
})

describe('VARIANCE_THRESHOLD_DEFAULT', () => {
  it('is exported and positive', () => {
    expect(VARIANCE_THRESHOLD_DEFAULT).toBeGreaterThan(0)
  })

  it('samples with variance just below threshold → steady', () => {
    // 2-sample window, ax = ±d → componentVarianceSum = d²
    // Use 0.99×sqrt(threshold) so d² ≈ 0.98×threshold < threshold
    const d = Math.sqrt(VARIANCE_THRESHOLD_DEFAULT) * 0.99
    let s = initialSteadinessState()
    s = feedAccel(s, { t: 0,   ax:  d, ay: 0, az: 0 })
    s = feedAccel(s, { t: 100, ax: -d, ay: 0, az: 0 })
    expect(s.steady).toBe(true)
  })

  it('samples with variance just above threshold → not steady', () => {
    // Use 1.01×sqrt(threshold) so d² ≈ 1.02×threshold > threshold
    const d = Math.sqrt(VARIANCE_THRESHOLD_DEFAULT) * 1.01
    let s = initialSteadinessState()
    s = feedAccel(s, { t: 0,   ax:  d, ay: 0, az: 0 })
    s = feedAccel(s, { t: 100, ax: -d, ay: 0, az: 0 })
    expect(s.steady).toBe(false)
  })
})
