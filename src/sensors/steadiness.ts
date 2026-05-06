export type AccelSample = {
  t: number  // milliseconds (DOMHighResTimeStamp / performance.now() epoch)
  ax: number // m/s²
  ay: number
  az: number
}

export type SteadinessState = {
  readonly window: readonly AccelSample[]
  readonly lastT: number
  readonly steady: boolean
}

export const WINDOW_MS = 200

// (m/s²)² population variance. Empirical baseline: quiet hand ~0.05, active hand ~1.5.
// 0.5 sits between typical resting noise and perceptible hand movement.
export const VARIANCE_THRESHOLD_DEFAULT = 0.5

// Start optimistically steady — assume stationary until proven shaky.
// This prevents false capture-blocks before the window fills on startup.
export function initialSteadinessState(): SteadinessState {
  return { window: [], lastT: -Infinity, steady: true }
}

// Callers must coerce LinearAccelerationSensor.x/y/z (which are number | null)
// to number before constructing AccelSample. Passing null as a number will
// produce NaN, which feedAccel drops silently — captures would never unblock.
export function feedAccel(
  state: SteadinessState,
  sample: AccelSample,
  threshold = VARIANCE_THRESHOLD_DEFAULT
): SteadinessState {
  if (!isFiniteSample(sample)) return state
  // Discard out-of-order samples (browser throttling, event-queue drain).
  // Stale samples would inflate the window or corrupt cutoff computation.
  if (sample.t < state.lastT) return state

  const cutoff = sample.t - WINDOW_MS
  // >= is intentional: a sample exactly WINDOW_MS old is within the 200ms window.
  const window = [...state.window.filter(s => s.t >= cutoff), sample]
  const steady = componentVarianceSum(window) <= threshold
  return { window, lastT: sample.t, steady }
}

// Sum of per-axis population variance (/ n, not / n-1): these are the exact
// observed readings, not a sample from a larger population. Per-axis computation
// captures directional changes that magnitude-only variance misses (e.g., ±5 m/s²
// alternating on one axis has magnitude 5 both times → magnitude variance = 0,
// but component variance = 25).
function componentVarianceSum(samples: readonly AccelSample[]): number {
  if (samples.length < 2) return 0
  const n = samples.length
  const meanAx = samples.reduce((s, p) => s + p.ax, 0) / n
  const meanAy = samples.reduce((s, p) => s + p.ay, 0) / n
  const meanAz = samples.reduce((s, p) => s + p.az, 0) / n
  return (
    samples.reduce((s, p) => s + (p.ax - meanAx) ** 2, 0) / n +
    samples.reduce((s, p) => s + (p.ay - meanAy) ** 2, 0) / n +
    samples.reduce((s, p) => s + (p.az - meanAz) ** 2, 0) / n
  )
}

function isFiniteSample(s: AccelSample): boolean {
  return isFinite(s.ax) && isFinite(s.ay) && isFinite(s.az) && isFinite(s.t)
}
