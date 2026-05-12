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

// Rolling window for steadiness evaluation. 200 ms was measured on a mid-range
// Android device running Chrome 124, with the phone held at a natural single-handed
// scanning posture aimed at a shelf. It is NOT calibrated for desktop mouse/trackpad
// input, where motion characteristics differ significantly.
export const WINDOW_MS = 200

// (m/s²)² population variance. Empirical baseline: quiet hand ~0.05, active hand ~1.5.
// 0.5 sits between typical resting noise and perceptible hand movement.
// This value was chosen to balance two failure modes:
//   - false-positives: capture is blocked even though the hand is steady enough
//   - false-negatives: capture is allowed even though the hand is still shaking
// Lower values are stricter (fewer false-negatives, more false-positives).
// Calibrated for single-handed shelf scanning; NOT representative of two-handed
// or tripod use, where variance is substantially lower.
export const VARIANCE_THRESHOLD_DEFAULT = 0.5

// Start optimistically steady — assume stationary until proven shaky.
// This prevents false capture-blocks before the window fills on startup.
export function initialSteadinessState(): SteadinessState {
  return { window: [], lastT: -Infinity, steady: true }
}

/**
 * Advances the steadiness window by one acceleration sample and returns the
 * updated state.
 *
 * @warning If any acceleration component is `null` or `NaN`, that axis is
 * silently treated as 0 by the caller's coercion before this function is
 * reached (TypeScript callers must coerce `LinearAccelerationSensor.x/y/z`,
 * which are `number | null`, to `number` before constructing `AccelSample`).
 * A phone with a failing accelerometer will always appear steady, and captures
 * will **never** be blocked by the steadiness gate.
 */
export function feedAccel(
  state: SteadinessState,
  sample: AccelSample,
  threshold = VARIANCE_THRESHOLD_DEFAULT
): SteadinessState {
  if (!isFiniteSample(sample)) return state
  // Discard out-of-order and duplicate-timestamp samples (browser throttling,
  // event-queue drain, or degraded sensors emitting repeated timestamps).
  // Duplicate timestamps grow the window unboundedly since the cutoff filter
  // retains all entries with t >= (same timestamp - WINDOW_MS).
  if (sample.t <= state.lastT) return state

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
