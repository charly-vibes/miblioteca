export type GyroSample = {
  t: number    // ms (DOMHighResTimeStamp)
  gx: number   // rad/s, pitch rate (x-axis)
  gy: number   // rad/s, roll rate (y-axis)
  gz: number   // rad/s, yaw rate (z-axis)
}

export type GhostOverlayState = {
  readonly yawIntegral: number  // accumulated yaw in radians since last reset
  readonly lastT: number        // ms of last sample (-Infinity = no sample yet)
  readonly omegaMag: number     // |ω| = sqrt(gx²+gy²+gz²), rad/s
}

const DEFAULT_HFOV_DEG = 65

export function initialGhostState(): GhostOverlayState {
  return { yawIntegral: 0, lastT: -Infinity, omegaMag: 0 }
}

export function feedGhostGyro(state: GhostOverlayState, sample: GyroSample): GhostOverlayState {
  if (!isFinite(sample.gz) || !isFinite(sample.gx) || !isFinite(sample.gy) || !isFinite(sample.t)) return state
  if (sample.t < state.lastT) return state

  const omegaMag = Math.sqrt(sample.gx ** 2 + sample.gy ** 2 + sample.gz ** 2)

  if (!isFinite(state.lastT)) {
    return { yawIntegral: state.yawIntegral, lastT: sample.t, omegaMag }
  }

  const dt = (sample.t - state.lastT) / 1000 // ms → seconds
  return {
    yawIntegral: state.yawIntegral + sample.gz * dt,
    lastT: sample.t,
    omegaMag,
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
