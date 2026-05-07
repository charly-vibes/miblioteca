export type GyroSample = {
  t: number   // ms (DOMHighResTimeStamp)
  gz: number  // rad/s, yaw rate (z-axis rotation)
}

export type GhostOverlayState = {
  readonly yawIntegral: number  // accumulated yaw in radians since last reset
  readonly lastT: number        // ms of last sample (-Infinity = no sample yet)
}

const DEFAULT_HFOV_DEG = 65

export function initialGhostState(): GhostOverlayState {
  return { yawIntegral: 0, lastT: -Infinity }
}

export function feedGhostGyro(state: GhostOverlayState, sample: GyroSample): GhostOverlayState {
  if (!isFinite(sample.gz) || !isFinite(sample.t)) return state
  if (sample.t < state.lastT) return state

  if (!isFinite(state.lastT)) {
    // First sample — no dt to integrate, just record time.
    return { yawIntegral: state.yawIntegral, lastT: sample.t }
  }

  const dt = (sample.t - state.lastT) / 1000 // ms → seconds
  return {
    yawIntegral: state.yawIntegral + sample.gz * dt,
    lastT: sample.t,
  }
}

// shiftX = -(videoWidth/2) / tan(hFov/2) * yawIntegral, clamped to ±videoWidth/2.
// Positive yaw (camera swings right) → negative shift (overlay moves left).
export function computeShiftPx(yawIntegral: number, videoWidth: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const hFovRad = (hFovDeg * Math.PI) / 180
  const shift = -(videoWidth / 2) / Math.tan(hFovRad / 2) * yawIntegral
  const half = videoWidth / 2
  return Math.max(-half, Math.min(half, shift))
}
