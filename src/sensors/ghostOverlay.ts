export type GyroSample = {
  t: number    // ms (DOMHighResTimeStamp)
  gx: number   // rad/s, pitch rate (x-axis)
  gy: number   // rad/s, rotation around device y-axis (gamma rate); used as scan axis for portrait phones
  gz: number   // rad/s, rotation around device z-axis (alpha rate)
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

  const dt = Math.min((sample.t - state.lastT) / 1000, 0.5) // ms → s, clamped to 500ms to guard against stale lastT after long pauses
  // Portrait phones sweep left/right around their y-axis (gy/gamma). Negate so that
  // sweeping right (gy < 0) produces positive yawIntegral → ghost shifts left (appears fixed in space).
  return {
    yawIntegral: state.yawIntegral - sample.gy * dt,
    lastT: sample.t,
    omegaMag,
  }
}

// shiftX = -(videoWidth/2) / tan(hFov/2) * yawIntegral, clamped to ±videoWidth/2.
// Camera sweeps right (gy < 0) → yawIntegral > 0 → negative shift (ghost moves left, appears fixed in space).
export function computeShiftPx(yawIntegral: number, videoWidth: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const hFovRad = (hFovDeg * Math.PI) / 180
  const shift = -(videoWidth / 2) / Math.tan(hFovRad / 2) * yawIntegral
  const half = videoWidth / 2
  return Math.max(-half, Math.min(half, shift))
}
